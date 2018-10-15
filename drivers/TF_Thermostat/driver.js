'use strict';

const path = require('path');
const ZwaveDriver = require('homey-zwavedriver');
const MasterData = {
	'Energy Save Heat': {
		Mode: 'Energy Save Heat',
		Setpoint: 'Energy Save Heating',
		Setting: 'ECO_setpoint',
		Parameter: '11',
		Mode_no: '11',
	},
	Heat: {
		Mode: 'Heat',
		Setpoint: 'Heating 1',
		Setting: 'CO_setpoint',
		Parameter: '10',
		Mode_no: '1',
	},
	Cool: {
		Mode: 'Cool',
		Setpoint: 'Cooling 1',
		Setting: 'COOL_setpoint',
		Parameter: '13',
		Mode_no: '2',
	},
	Off: {
		Mode: 'Off',
		Mode_no: '0',
	},
};

// Create Mode2Setting array based on MasterData array
const Mode2Setting = {};
for (const mode in MasterData) {
	Mode2Setting[MasterData[mode].Mode] = MasterData[mode].Setting;
}

// Create Mode2Setpoint array based on MasterData array
const Mode2Setpoint = {};
for (const mode in MasterData) {
	Mode2Setpoint[MasterData[mode].Mode] = MasterData[mode].Setpoint;
}

// Create Setpoint2Setting array based on MasterData array
const Setpoint2Setting = {};
for (const mode in MasterData) {
	Setpoint2Setting[MasterData[mode].Setpoint] = MasterData[mode].Setting;
}

// Create Mode2Number array based on MasterData array
const Mode2Number = {};
for (const mode in MasterData) {
	Mode2Number[MasterData[mode].Mode] = MasterData[mode].Mode_no;
}

// http://products.z-wavealliance.org/products/1182

module.exports = new ZwaveDriver(path.basename(__dirname), {
	debug: false,
	capabilities: {
		measure_temperature: {
			command_class: 'COMMAND_CLASS_SENSOR_MULTILEVEL',
			command_get: 'SENSOR_MULTILEVEL_GET',
			command_get_parser: () => ({
				'Sensor Type': 'Temperature (version 1)',
				Properties1: {
					Scale: 0,
				},
			}),
			command_report: 'SENSOR_MULTILEVEL_REPORT',
			command_report_parser: report => {
				if (!report) return null;
				if (report['Sensor Type'] === 'Temperature (version 1)') return report['Sensor Value (Parsed)'];
				return null;
			},
			pollInterval: 'poll_interval',
		},
		target_temperature: {
			command_class: 'COMMAND_CLASS_THERMOSTAT_SETPOINT',
			command_get: 'THERMOSTAT_SETPOINT_GET',
			command_get_parser: node => {
				// enable initial GET
				let setpointType = 'Heating 1';
				// GET the setpointType for the active mode
				if (node && typeof node.state.thermofloor_mode !== 'undefined') {
					setpointType = Mode2Setpoint[node.state.thermofloor_mode];
				}
				module.exports._debug('SETPOINT GET - Setpoint GET for:', setpointType);
				return {
					Level: {
						'Setpoint Type': setpointType,
					},
				};
			},
			command_set: 'THERMOSTAT_SETPOINT_SET',
			command_set_parser: (value, node) => {
				// Create 2 byte buffer of value, with value rounded to xx.5
				if (!value) value = 18;
				let setpointValue = new Buffer(2);
				setpointValue.writeUIntBE((value * 2).toFixed() / 2 * 10, 0, 2);

				// enable initial SET
				let setpointType = 'Heating 1';
				// GET the setpointType for the active mode
				if (node && typeof node.state.thermofloor_mode !== 'undefined') {
					setpointType = Mode2Setpoint[node.state.thermofloor_mode];
				}
				// function updateSetpoint(node, setpointValue, setpointMode)
				updateSetpoint(node, value, setpointType);
				return {
					Level: {
						'Setpoint Type': setpointType,
					},
					Level2: {
						Precision: 1, // Number has one decimal
						Scale: 0, // No scale used
						Size: 2, // Value = 2 Bytes
					},
					Value: setpointValue,
				};
			},
			command_report: 'THERMOSTAT_SETPOINT_REPORT',
			command_report_parser: (report, node) => {
				if (report &&
					report.hasOwnProperty('Value') &&
					report.hasOwnProperty('Level2') &&
					typeof report.Level2.Precision === 'number' &&
					typeof report.Level2.Size === 'number') {
					let reportValue;
					try {
						reportValue = report.Value.readUIntBE(0, report.Level2.Size);
					}
					catch (err) {
						return null;
					}

					if (typeof reportValue === 'number') {
						const setpointValue = reportValue / Math.pow(10, report.Level2.Precision);
						const setpointType = report.Level['Setpoint Type'];

						// function updateSetpoint(node, setpointValue, setpointMode)
						updateSetpoint(node, setpointValue, setpointType);

						// Update target_temperature state only if reported setpoint matches the current thermostat mode state
						if (typeof node.state.thermofloor_mode !== 'undefined' &&
							setpointType === Mode2Setpoint[node.state.thermofloor_mode] &&
							setpointValue !== node.state.target_temperature) {
							module.exports._debug('SETPOINT REPORT - Update setpoint state (target_temperature) to:', setpointValue,
								'with typeof:', typeof setpointValue);
							return setpointValue;
						}
						return null;
					}
				}
				return null;
			},
		},
		thermofloor_onoff: {
			command_class: 'COMMAND_CLASS_BASIC',
			command_report: 'BASIC_SET',
			command_report_parser: (report, node) => {
				const active = report.Value === 255;
				module.exports._debug('ONOFF REPORT - Thermostat state changed to:', active);

                if (node && active !== node.state.active) {
                    node.state.active = active;
                    module.exports._debug('ONOFF REPORT: Triggering flows');
                    Homey.manager('flow').triggerDevice('thermofloor_state_changed', {
                        active: active
                    }, null, node.device_data);
                }

				return active;
			},
		},
		thermofloor_mode: {
			command_class: 'COMMAND_CLASS_THERMOSTAT_MODE',
			command_get: 'THERMOSTAT_MODE_GET',
			command_set: 'THERMOSTAT_MODE_SET',
			command_set_parser: (value, node) => {
				// update state based on stored setpoint
				updateMode(node, value);
				return {
					Level: {
						'No of Manufacturer Data fields': 0,
						Mode: value,
					},
					'Manufacturer Data': new Buffer([0]),
				};
			},
			command_report: 'THERMOSTAT_MODE_REPORT',
			command_report_parser: (report, node) => {

				if (!report) return null;
				if (report.hasOwnProperty('Level') && report.Level.hasOwnProperty('Mode')) {

					module.exports._debug('MODE REPORT: report mode:', report.Level.Mode,
						'mode state:', node.state.thermofloor_mode);

					if (node && report.Level.Mode !== node.state.thermofloor_mode) {
						module.exports._debug('MODE REPORT: Triggering flows');
						Homey.manager('flow').triggerDevice('thermofloor_mode_changed', {
							mode: report.Level.Mode,
							mode_name: __("mode." + report.Level.Mode),
						}, null, node.device_data);
						Homey.manager('flow').triggerDevice('thermofloor_mode_changed_to', null, {
							mode: report.Level.Mode,
						}, node.device_data);
					}
					// update state based on stored setpoints
					updateMode(node, report.Level.Mode);
					return report.Level.Mode;
				}
				return null;
			},
		},
	},
	settings: {
		operation_mode: {
			index: 1,
			size: 2,
		},
		temp_sensor: {
			index: 2,
			size: 2,
		},
		floor_sensor: {
			index: 3,
			size: 2,
		},
		temperature_control_hysteresis: {
			index: 4,
			size: 2,
		},
		FLO_floor_min: {
			index: 5,
			size: 2,
		},
		FHI_floor_max: {
			index: 6,
			size: 2,
		},
		ALO_air_min: {
			index: 7,
			size: 2,
		},
		AHI_air_max: {
			index: 8,
			size: 2,
		},
		PLO_temp_min: {
			index: 9,
			size: 2,
		},
		CO_setpoint: {
			index: 10,
			size: 2,
			// open work: add parser to update setpoint / state if active
		},
		ECO_setpoint: {
			index: 11,
			size: 2,
			// opene work: add parser to update setpoint / state if active
		},
		P_setting: {
			index: 12,
			size: 2,
		},
		COOL_setpoint: {
			index: 13,
			size: 2,
			// open work: add parser to update setpoint / state if active
		},
	},
});

Homey.manager('flow').on('trigger.thermofloor_mode_changed_to', (callback, args, state) => {
	if (!args) return callback('arguments_error', false);
	else if (!state) return callback('state_error', false);

	else if (typeof args.mode !== 'undefined' && typeof state.mode !== 'undefined' &&
		args.mode === state.mode) return callback(null, true);
	else return callback('unknown_error', false);
});

Homey.manager('flow').on('action.thermofloor_change_mode', (callback, args) => {
	const node = module.exports.nodes[args.device.token];
	// args == setpointType based on ID's
	if (!args.hasOwnProperty('setpointMode')) return callback('setpointMode_property_missing');
	if (typeof args.setpointMode !== 'string') return callback('setpointMode_is_not_a_string');

	if (node &&
		node.instance &&
		node.instance.CommandClass &&
		node.instance.CommandClass.COMMAND_CLASS_THERMOSTAT_MODE) {
		module.exports._debug('ACTION MODE: set thermostat mode to:', args.setpointMode);
		updateMode(node, args.setpointMode);
		node.instance.CommandClass.COMMAND_CLASS_THERMOSTAT_MODE.THERMOSTAT_MODE_SET({
			Level: {
				'No of Manufacturer Data fields': 0,
				Mode: args.setpointMode,
			},
			'Manufacturer Data': new Buffer([0]),
		}, (err, result) => {
			if (err) return callback(err);

			// If properly transmitted, change the setting and finish flow card
			if (result === 'TRANSMIT_COMPLETE_OK') {
				node.state.thermofloor_mode = args.setpointMode;
				module.exports.realtime(node.device_data, 'thermofloor_mode', args.setpointMode);

				return callback(null, true);
			}
			return callback('unknown_response');
		});
	}
	else return callback('unknown_error');
});


Homey.manager('flow').on('action.thermofloor_change_mode_setpoint', (callback, args) => {
	const node = module.exports.nodes[args.device.token];
	// args == setpointType based on ID's and setpointValue (degrees)
	// Check forced brightness level property
	if (!args.hasOwnProperty('setpointMode')) return callback('setpointMode_property_missing');
	if (typeof args.setpointMode !== 'string') return callback('setpointMode_is_not_a_string');
	if (!args.hasOwnProperty('setpointValue')) return callback('setpointValue_property_missing');
	if (typeof args.setpointValue !== 'number') return callback('setpointValue_is_not_a_number');

	if (node &&
		node.instance &&
		node.instance.CommandClass &&
		node.instance.CommandClass.COMMAND_CLASS_THERMOSTAT_SETPOINT) {

		const setpointValue = new Buffer(2);
		setpointValue.writeUIntBE((args.setpointValue * 2).toFixed() / 2 * 10, 0, 2);

		const setpointType = Mode2Setpoint[args.setpointMode];
		module.exports._debug('ACTION SETPOIT: set setpoint', setpointType, 'to value:', setpointValue);
		updateSetpoint(node, args.setpointValue, setpointType);

		node.instance.CommandClass.COMMAND_CLASS_THERMOSTAT_SETPOINT.THERMOSTAT_SETPOINT_SET({
			Level: {
				'Setpoint Type': setpointType,
			},
			Level2: {
				Precision: 1, // Number has one decimal
				Scale: 0, // No scale used
				Size: 2, // Value = 2 Bytes
			},
			Value: setpointValue,
		}, (err, result) => {
			if (err) return callback(err);

			// If properly transmitted, change the setting and finish flow card
			if (result === 'TRANSMIT_COMPLETE_OK') {
				if (args.setpointMode === node.state.thermofloor_mode) {
					node.state.target_temperature = args.setpointValue;
					module.exports.realtime(node.device_data, 'target_temperature', args.setpointValue);
				}
				return callback(null, true);
			}
			return callback('unknown_response');
		});
	}
	else return callback('unknown_error');
});

function updateMode(node, mode) {
	// If thermostat mode has been changed get thermostat setpoint from stored settings
	if (typeof mode !== 'undefined' && mode !== node.state.thermofloor_mode) {
		const SetpointSetting = Mode2Setting[mode];
		const ModeNumber = Mode2Number[mode];

		module.exports._debug('MODE CHANGE: mode:', mode, 'update operation_mode to number:', ModeNumber);
		// update thermostat mode parameters
		module.exports.setSettings(node.device_data, {
			operation_mode: ModeNumber,
		});

		if (mode !== 'Off') {
			// update thermostat setpoint (parameters) if changed
			module.exports.getSettings(node.device_data, (err, settings) => {
				if (!err &&
					settings &&
					settings.hasOwnProperty([SetpointSetting])) {
					const newSetpoint = settings[SetpointSetting] / Math.pow(10, 1);
					if (newSetpoint !== node.state.target_temperature) {
						module.exports._debug('MODE CHANGE: update setpoint state from:', node.state.target_temperature,
							'to:', newSetpoint, 'based on stored value from setting:', SetpointSetting);
						node.state.target_temperature = newSetpoint;
						module.exports.realtime(node.device_data, 'target_temperature', newSetpoint);
					}
					else {
						module.exports._debug('MODE CHANGE: setpoint value did not change:', newSetpoint,
							'state will not be updated');
					}
				}
			});
		}
		// If thermostat has been switched off clear thermostat setpoint
		if (mode === 'Off') {
			module.exports._debug('MODE CHANGE: thermostat switched off, clearing setpoint');
			node.state.target_temperature = null;
			module.exports.realtime(node.device_data, 'target_temperature', null);
		}
	}
}

function updateSetpoint(node, setpointValue, setpointType) {
	// If thermostat mode has been changed get thermostat setpoint from stored settings
	// Update setting based on reported setpoint if mode is not equal to 'Off'
	if (setpointType !== 'Off') {
		const setpointSetting = Setpoint2Setting[setpointType];
		module.exports._debug('SETPOINT CHANGE - Update setting:', setpointSetting,
			'with the setpoint value:', setpointValue * 10);
		module.exports.setSettings(node.device_data, {
			[setpointSetting]: setpointValue * 10,
		});
	}
}