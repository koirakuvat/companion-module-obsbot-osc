import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateVariableDefinitions } from './variables.js'
import { InitConnection, SendCommand } from './api.js'
import { UpdatePresets } from './presets.js'
import { StartHttpPolling, StopHttpPolling, getCameraStatus, type CameraStatus } from './http-polling.js'

export class OBSBOTInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	_socket: any // Socket for communication, type can be more specific based on implementation
	DEVICES: [] = [] // Device list, type can be more specific based on implementation
	_pollTimer: ReturnType<typeof setInterval> | undefined
	_cameraStatus: CameraStatus | undefined
	_cameraStatusUpdatedAt: number | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.updateActions() // export actions
		this.updateVariableDefinitions() // export variable definitions
		this.updatePresets() // export presets
		this.updateStatus(InstanceStatus.Connecting)
		await this.initConnection()
		StartHttpPolling(this)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		StopHttpPolling(this)
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.updateActions()
		this.updateVariableDefinitions()
		this.updatePresets()
		this.updateStatus(InstanceStatus.Connecting)
		await this.initConnection()
		StartHttpPolling(this)
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	async initConnection(): Promise<void> {
		await InitConnection(this)
	}

	sendCommand(address: string, args: OSCArgument[]): void {
		SendCommand(this, address, args)
	}

	/**
	 * Get the current camera status for use in action callbacks.
	 * Returns cached data if fresh enough, otherwise fetches from the camera.
	 * @param maxAgeMs  max cache age in ms (default 2000, use 0 to force fresh fetch)
	 *
	 * Example usage in an action callback:
	 *   callback: async (action) => {
	 *       const status = await self.getCameraStatus(0)
	 *       if (!status) return
	 *       const currentIso = status.exposure.iso
	 *       // compute new value, send command...
	 *   }
	 */
	async getCameraStatus(maxAgeMs: number = 2000): Promise<CameraStatus | null> {
		return getCameraStatus(this, maxAgeMs)
	}
}

runEntrypoint(OBSBOTInstance, UpgradeScripts)
