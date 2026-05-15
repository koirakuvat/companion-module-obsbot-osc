import http from 'node:http'
import type { OBSBOTInstance } from './main.js'

export interface CameraStatus {
	hdr: { fps: number; enable: boolean }
	night_mode: { fps: number; enable: boolean }
	mirror: boolean
	focus: {
		focus_mode: string
		focus_position: number
		auto_focus_mode: string
	}
	exposure: {
		auto: boolean
		mode: number
		compensate: number
		iso_min: number
		iso_max: number
		shutter_max: number
		shutter_value: number
		iso: number
	}
	anti_flicker: number
	balance: {
		mode: number
		color: number
	}
	screen: {
		mode: number
		luma: number
		contrast: number
		saturation: number
		sharpness: number
		tone: number
	}
}

function getExposureModeName(mode: number): string {
	switch (mode) {
		case 0:
			return 'Auto'
		case 1:
			return 'Manual'
		case 2:
			return 'Shutter Priority'
		case 3:
			return 'ISO Priority'
		default:
			return `Unknown (${mode})`
	}
}

function getWhiteBalanceModeName(mode: number): string {
	switch (mode) {
		case 0:
			return 'Auto'
		case 255:
			return 'Manual'
		default:
			return `Preset (${mode})`
	}
}

function getAntiFlickerName(value: number): string {
	switch (value) {
		case 0:
			return 'Off'
		case 1:
			return '50Hz'
		case 2:
			return '60Hz'
		default:
			return `Unknown (${value})`
	}
}

/**
 * Camera shutter_value is an index starting at 10.
 * Confirmed data points: 10 → 6400, 11 → 5000, 25 → 200, 28 → 100.
 * The denominator values are those accepted by the SetShutterSpeed OSC command,
 * taken from the actions.setShutterSpeed dropdown (NOT standard 1/3 EV stops —
 * the camera rejects e.g. 125 and expects 120 instead).
 * Not every index is populated — the step helpers scan for the next valid entry.
 */
export const SHUTTER_SPEED_TABLE: ReadonlyMap<number, number> = new Map([
	[10, 6400],
	[11, 5000],
	[13, 3200],
	[14, 2500],
	[15, 2000],
	[16, 1600],
	[17, 1250],
	[18, 1000],
	[19, 800],
	[20, 640],
	[21, 500],
	[22, 400],
	[23, 320],
	[24, 240],
	[25, 200],
	[26, 160],
	[27, 120],
	[28, 100],
	[29, 80],
	[30, 60],
	[31, 50],
	[32, 40],
	[33, 30],
	[34, 25],
	[35, 20],
	[36, 15],
	[37, 12.5],
	[38, 10],
	[39, 8],
	[40, 6.25],
	[41, 5],
	[42, 4],
	[43, 3],
	[44, 2.5],
])

/** Smallest index in SHUTTER_SPEED_TABLE (fastest shutter). */
export const SHUTTER_INDEX_MIN = 10
/** Largest index in SHUTTER_SPEED_TABLE (slowest shutter). */
export const SHUTTER_INDEX_MAX = 44

/**
 * Find the next populated shutter index in a given direction.
 * Returns the [index, denominator] pair, or undefined if no further entry exists.
 */
export function nextShutterIndex(fromIndex: number, direction: 1 | -1): { index: number; speed: number } | undefined {
	const limit = direction === -1 ? SHUTTER_INDEX_MIN : SHUTTER_INDEX_MAX
	for (let i = fromIndex + direction; direction === -1 ? i >= limit : i <= limit; i += direction) {
		const speed = SHUTTER_SPEED_TABLE.get(i)
		if (speed !== undefined) return { index: i, speed }
	}
	return undefined
}

/**
 * ISO steps in 1/3 stop increments, lowest → highest.
 * These are the standard values; if the camera rejects any, remove them from this list.
 */
export const ISO_STEPS: readonly number[] = [
	100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400,
]

/**
 * Exposure compensation steps (×10 scale) sent via OSC, matching actions.setExposureCompensate.
 * The camera JSON returns the real EV float (e.g. -0.3); multiply by 10 and round to
 * find the nearest entry in this table.  Ordered most-negative → most-positive.
 */
export const EV_COMP_STEPS: readonly number[] = [
	-30, -27, -23, -20, -17, -13, -10, -7, -3, 0, 3, 7, 10, 13, 17, 20, 23, 27, 30,
]

function shutterValueToSpeed(index: number): string {
	const speed = SHUTTER_SPEED_TABLE.get(index)
	if (speed === undefined) return `Unknown (${index})`
	return `1/${speed}`
}

export function StartHttpPolling(self: OBSBOTInstance): void {
	StopHttpPolling(self)

	const interval = (self.config.pollInterval ?? 5) * 1000

	if (interval <= 0) {
		self.log('debug', 'HTTP polling disabled (interval is 0)')
		return
	}

	self.log('info', `Starting HTTP camera status polling every ${interval / 1000}s`)

	// Poll immediately on start
	void fetchCameraStatus(self)

	self._pollTimer = setInterval(() => {
		void fetchCameraStatus(self)
	}, interval)
}

export function StopHttpPolling(self: OBSBOTInstance): void {
	if (self._pollTimer) {
		clearInterval(self._pollTimer)
		self._pollTimer = undefined
	}
}

/**
 * Fetch current camera status from the HTTP endpoint.
 * Called by the polling timer, but also available for on-demand use by actions.
 * Returns the CameraStatus object, or null on failure.
 * Always updates _cameraStatus, _cameraStatusUpdatedAt and companion variables on success.
 */
export async function fetchCameraStatus(self: OBSBOTInstance): Promise<CameraStatus | null> {
	const url = `http://${self.config.ip}/camera/sdk/image`

	try {
		const body = await httpGet(url, 5000)

		const data = JSON.parse(body) as CameraStatus
		self._cameraStatus = data
		self._cameraStatusUpdatedAt = Date.now()

		if (self.config.verbose) {
			self.log('debug', `Camera status: ${JSON.stringify(data)}`)
		}

		updateCameraVariables(self, data)
		return data
	} catch (err: any) {
		if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
			self.log('warn', `Camera status poll timed out for ${url}`)
		} else {
			self.log('debug', `Camera status poll failed: ${err.message}`)
		}
		return self._cameraStatus ?? null
	}
}

/**
 * Simple HTTP GET returning the response body as a string.
 * Uses Node's built-in http module (supported in all Node versions).
 */
async function httpGet(url: string, timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = http.get(url, { timeout: timeoutMs }, (res) => {
			if (res.statusCode !== 200) {
				res.resume()
				reject(new Error(`HTTP ${res.statusCode}`))
				return
			}
			const chunks: Buffer[] = []
			res.on('data', (chunk: Buffer) => chunks.push(chunk))
			res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
			res.on('error', reject)
		})
		req.on('error', reject)
		req.on('timeout', () => {
			req.destroy()
			const err = new Error('Request timeout')
			;(err as any).code = 'ECONNABORTED'
			reject(err)
		})
	})
}

/**
 * Get the current camera status, using the cache if it is fresh enough.
 * @param self       module instance
 * @param maxAgeMs   maximum acceptable age of cached data in milliseconds (default 2000)
 *
 * If the cached status is younger than maxAgeMs, returns it immediately without
 * an HTTP round-trip. Otherwise fetches fresh data from the camera.
 * Actions that need a guaranteed-fresh value before computing an increment
 * should call this with a low maxAgeMs (or 0 to force a fetch).
 */
export async function getCameraStatus(self: OBSBOTInstance, maxAgeMs: number = 2000): Promise<CameraStatus | null> {
	const age = Date.now() - (self._cameraStatusUpdatedAt ?? 0)
	if (self._cameraStatus && age < maxAgeMs) {
		return self._cameraStatus
	}
	return fetchCameraStatus(self)
}

function updateCameraVariables(self: OBSBOTInstance, data: CameraStatus): void {
	const vars: Record<string, string | number | boolean | undefined> = {}

	// Exposure
	vars['exposure_mode'] = getExposureModeName(data.exposure.mode)
	vars['exposure_auto'] = data.exposure.auto ? 'Auto' : 'Manual'
	vars['exposure_compensation'] = data.exposure.compensate
	vars['iso'] = data.exposure.iso
	vars['iso_min'] = data.exposure.iso_min
	vars['iso_max'] = data.exposure.iso_max
	vars['shutter_speed'] = shutterValueToSpeed(data.exposure.shutter_value)
	vars['shutter_value'] = data.exposure.shutter_value
	vars['shutter_max'] = data.exposure.shutter_max

	// Focus
	vars['focus_mode'] = data.focus.focus_mode.toUpperCase()
	vars['autofocus_mode'] = data.focus.auto_focus_mode
	vars['focus_position'] = data.focus.focus_position

	// White balance
	vars['wb_mode'] = getWhiteBalanceModeName(data.balance.mode)
	vars['wb_color_temp'] = data.balance.color

	// HDR / Night mode
	vars['hdr_enabled'] = data.hdr.enable ? 'On' : 'Off'
	vars['night_mode_enabled'] = data.night_mode.enable ? 'On' : 'Off'

	// Mirror
	vars['mirror'] = data.mirror ? 'On' : 'Off'

	// Anti-flicker
	vars['anti_flicker'] = getAntiFlickerName(data.anti_flicker)

	// Screen / image adjustments
	vars['brightness'] = data.screen.luma
	vars['contrast'] = data.screen.contrast
	vars['saturation'] = data.screen.saturation
	vars['sharpness'] = data.screen.sharpness

	self.setVariableValues(vars)
}
