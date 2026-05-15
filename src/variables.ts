import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'

import type { OBSBOTInstance } from './main.js'

export function UpdateVariableDefinitions(self: OBSBOTInstance): void {
	const variables: CompanionVariableDefinition[] = []

	console.log('devices le ngth', self.DEVICES.length)
	if ((self.DEVICES.length as number) > 1) {
		for (let i = 0; i < self.DEVICES.length; i++) {
			variables.push({ variableId: `device${i + 1}_connected`, name: `Device ${i + 1} Connected` })
			variables.push({ variableId: `device${i + 1}_name`, name: `Device ${i + 1} Name` })
		}

		variables.push({ variableId: 'selected_index', name: 'Selected Device Index' })
		variables.push({ variableId: 'selected_state', name: 'Selected Device Run State' })
		variables.push({ variableId: 'selected_type', name: 'Selected Device Type' })
		variables.push({ variableId: 'selected_name', name: 'Selected Device Name' })
		variables.push({ variableId: 'selected_connected', name: 'Selected Device Connected' })
	} else if ((self.DEVICES.length as number) === 1) {
		variables.push({ variableId: 'device_name', name: 'Device Name' })
	}

	variables.push({ variableId: 'zoom', name: 'Zoom Level' })
	variables.push({ variableId: 'fov', name: 'Field of View' })
	variables.push({ variableId: 'gimbal_pitch', name: 'Gimbal Pitch' })
	variables.push({ variableId: 'gimbal_yaw', name: 'Gimbal Yaw' })

	// Camera status (via HTTP polling)
	variables.push({ variableId: 'exposure_mode', name: 'Exposure Mode' })
	variables.push({ variableId: 'exposure_auto', name: 'Exposure Auto/Manual' })
	variables.push({ variableId: 'exposure_compensation', name: 'Exposure Compensation' })
	variables.push({ variableId: 'iso', name: 'ISO Value' })
	variables.push({ variableId: 'iso_min', name: 'ISO Min' })
	variables.push({ variableId: 'iso_max', name: 'ISO Max' })
	variables.push({ variableId: 'shutter_speed', name: 'Shutter Speed' })
	variables.push({ variableId: 'shutter_value', name: 'Shutter Value (raw)' })
	variables.push({ variableId: 'shutter_max', name: 'Shutter Max' })
	variables.push({ variableId: 'focus_mode', name: 'Focus Mode' })
	variables.push({ variableId: 'autofocus_mode', name: 'Autofocus Mode' })
	variables.push({ variableId: 'focus_position', name: 'Focus Position' })
	variables.push({ variableId: 'wb_mode', name: 'White Balance Mode' })
	variables.push({ variableId: 'wb_color_temp', name: 'White Balance Color Temp' })
	variables.push({ variableId: 'hdr_enabled', name: 'HDR Enabled' })
	variables.push({ variableId: 'night_mode_enabled', name: 'Night Mode Enabled' })
	variables.push({ variableId: 'mirror', name: 'Mirror' })
	variables.push({ variableId: 'anti_flicker', name: 'Anti-Flicker' })
	variables.push({ variableId: 'brightness', name: 'Brightness' })
	variables.push({ variableId: 'contrast', name: 'Contrast' })
	variables.push({ variableId: 'saturation', name: 'Saturation' })
	variables.push({ variableId: 'sharpness', name: 'Sharpness' })

	self.setVariableDefinitions(variables)
}

export function CheckVariables(self: OBSBOTInstance): void {
	const variableValues: CompanionVariableValues = {}

	self.setVariableValues(variableValues)
}
