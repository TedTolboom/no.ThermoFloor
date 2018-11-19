'use strict';

const Homey = require('homey');
const maps = require('./lib/thermofloor/mappings');

class ThermoFloorApp extends Homey.App {
	onInit() {
		this.log(`${Homey.manifest.id} running...`);

		//thermofloor_mode_changed
		this.triggerThermofloorModeChanged = new Homey.FlowCardTriggerDevice('thermofloor_mode_changed');
		this.triggerThermofloorModeChanged
			.register();

		//thermofloor_mode_changed_to
		this.triggerThermofloorModeChangedTo = new Homey.FlowCardTriggerDevice('thermofloor_mode_changed_to');
		this.triggerThermofloorModeChangedTo
			.register()
			.registerRunListener((args, state) =>
				Promise.resolve(args.mode === state.mode));

		//thermostat_onoff trigger cards
		this.triggerThermofloorOnoffTrue = new Homey.FlowCardTriggerDevice('thermofloor_onoff_true').register();
		this.triggerThermofloorOnoffFalse = new Homey.FlowCardTriggerDevice('thermofloor_onoff_false').register();

		// Register conditions for flows
		this.conditionThermofloorOnoffOn = new Homey.FlowCardCondition('thermofloor_onoff_is_on')
			.register()
			.registerRunListener((args, state) => {
				return args.device.getCapabilityValue('thermofloor_onoff');
			});

		// Register actions for flows thermofloor_change_mode
		this._actionThermofloorChangeMode = new Homey.FlowCardAction('thermofloor_change_mode')
			.register()
			.registerRunListener((args, state) => {
				const thermostatMode = args.mode;
				args.device.log('FlowCardAction triggered for ', args.device.getName(), 'to change Thermostat mode to', thermostatMode);

				// Trigger the thermostat mode setParser
				return args.device.triggerCapabilityListener('thermofloor_mode', thermostatMode, {});
			});

		// Register actions for flows
		this._actionThermofloorChangeSetpoint = new Homey.FlowCardAction('thermofloor_change_mode_setpoint')
			.register()
			.registerRunListener(this._actionThermofloorChangeSetpointRunListener.bind(this));

	}

	// thermofloor_change_mode_setpoint
	async _actionThermofloorChangeSetpointRunListener(args, state) {

		if (!args.hasOwnProperty('setpointMode')) return Promise.reject('setpointMode_property_missing');
		if (!args.hasOwnProperty('setpointValue')) return Promise.reject('setpointValue_property_missing');
		if (typeof args.setpointValue !== 'number') return Promise.reject('setpointValue_is_not_a_number');

		// 1. Retrieve the setpointType based on the thermostat mode
		const setpointType = maps.Mode2Setpoint[args.setpointMode];
		const setpointValue = args.setpointValue;
		args.device.log('FlowCardAction triggered for ', args.device.getName(), 'to change setpoint value', setpointValue, 'for', setpointType);

		// 2. Store thermostat setpoint based on thermostat type
		args.device.setStoreValue(`thermostatsetpointValue.${setpointType}`, setpointValue);

		// 3. Update device settings setpoint value
		const setpointSetting = maps.Setpoint2Setting[setpointType];
		args.device.setSettings({
			[setpointSetting]: setpointValue * 10
		});

		// 5. Update UI if reported setpointType equals active sepointType based on the thermostat mode
		if (setpointType === maps.Mode2Setpoint[args.device.getCapabilityValue('thermofloor_mode') || 'Heat']) {
			args.device.log('Updated thermostat setpoint on UI to', setpointValue);
			args.device.setCapabilityValue('target_temperature', setpointValue);
		}

		// 6. Trigger command to update device setpoint
		const bufferValue = new Buffer(2);
		bufferValue.writeUInt16BE((Math.round(setpointValue * 2) / 2 * 10).toFixed(0));

		if (args.device.node.CommandClass.COMMAND_CLASS_THERMOSTAT_SETPOINT) {
			return await args.device.node.CommandClass.COMMAND_CLASS_THERMOSTAT_SETPOINT.THERMOSTAT_SETPOINT_SET({
				Level: {
					'Setpoint Type': setpointType,
				},
				Level2: {
					Size: 2,
					Scale: 0,
					Precision: 1,
				},
				Value: bufferValue,
			});

			return Promise.reject('unknown_error');
		}
	}
}

module.exports = ThermoFloorApp;