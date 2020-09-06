'use strict';

const Homey = require('homey');

class HeatitApp extends Homey.App {

  onInit() {
    this.log(`${Homey.manifest.id} running...`);

    this.triggerMeasureTemperatureFloor = new Homey.FlowCardTriggerDevice('measure_temperature.floor_changed');
    this.triggerMeasureTemperatureFloor
      .register();

    this.triggerMeasureTemperatureExternal = new Homey.FlowCardTriggerDevice('measure_temperature.external_changed');
    this.triggerMeasureTemperatureExternal
      .register();

    this.triggerMeasureTemperatureInternal = new Homey.FlowCardTriggerDevice('measure_temperature.internal_changed');
    this.triggerMeasureTemperatureInternal
      .register();

    this.triggerMeasureTemperatureInput1 = new Homey.FlowCardTriggerDevice('measure_temperature.input1_changed');
    this.triggerMeasureTemperatureInput1
      .register();

    this.triggerMeasureTemperatureInput2 = new Homey.FlowCardTriggerDevice('measure_temperature.input2_changed');
    this.triggerMeasureTemperatureInput2
      .register();

    this.triggerMeasureTemperatureInput3 = new Homey.FlowCardTriggerDevice('measure_temperature.input3_changed');
    this.triggerMeasureTemperatureInput3
      .register();

    this.triggerMeasureTemperatureInput4 = new Homey.FlowCardTriggerDevice('measure_temperature.input4_changed');
    this.triggerMeasureTemperatureInput4
      .register();

    // thermofloor_mode_changed
    this.triggerThermofloorModeChanged = new Homey.FlowCardTriggerDevice('thermofloor_mode_changed');
    this.triggerThermofloorModeChanged
      .register();

    // thermofloor_mode_changed_to
    this.triggerThermofloorModeChangedTo = new Homey.FlowCardTriggerDevice('thermofloor_mode_changed_to');
    this.triggerThermofloorModeChangedTo
      .register()
      .registerRunListener((args, state) => Promise.resolve(args.mode === state.mode));

    // thermostat_mode_changed_to (Autocomplete)
    this.triggerThermostatModeChangedTo = new Homey.FlowCardTriggerDevice('thermostat_mode_changed_to');
    this.triggerThermostatModeChangedTo
      .getArgument('mode')
      .registerAutocompleteListener((query, args, callback) => args.device.onModeAutocomplete(query, args, callback));
    this.triggerThermostatModeChangedTo
      .register()
      .registerRunListener((args, state) => {
        return Promise.resolve(args.mode.id === state.mode);
      });

    // thermostat_onoff trigger cards
    this.triggerThermofloorOnoffTrue = new Homey.FlowCardTriggerDevice('thermofloor_onoff_true').register();
    this.triggerThermofloorOnoffFalse = new Homey.FlowCardTriggerDevice('thermofloor_onoff_false').register();

    // thermostat_onoff trigger cards
    this.triggerAlarmPowerTrue = new Homey.FlowCardTriggerDevice('alarm_power_true').register();
    this.triggerAlarmPowerFalse = new Homey.FlowCardTriggerDevice('alarm_power_false').register();

    // Z-button scene trigger cards
    this.triggerZPushButton_scene = new Homey.FlowCardTriggerDevice('Z-push-button_scene');
    this.triggerZPushButton_scene
      .register()
      .registerRunListener((args, state) => Promise.resolve(args.button.id === state.button && args.scene.id === state.scene));

    this.triggerZPushButton_scene
      .getArgument('scene')
      .registerAutocompleteListener((query, args, callback) => args.device.onSceneAutocomplete(query, args, callback));
    this.triggerZPushButton_scene
      .getArgument('button')
      .registerAutocompleteListener((query, args, callback) => args.device.onButtonAutocomplete(query, args, callback));

    // Z-button button trigger cards
    this.triggerZPushButton_button = new Homey.FlowCardTriggerDevice('Z-push-button_button');
    this.triggerZPushButton_button
      .register();

    // Z-Dim scene trigger cards
    this.triggerZDim_scene = new Homey.FlowCardTriggerDevice('Z-dim_scene');
    this.triggerZDim_scene
      .register()
      .registerRunListener((args, state) => Promise.resolve(args.scene.id === state.scene));

    this.triggerZDim_scene
      .getArgument('scene')
      .registerAutocompleteListener((query, args, callback) => args.device.onSceneAutocomplete(query, args, callback));

    // Z-button button trigger cards
    this.triggerZDim_button = new Homey.FlowCardTriggerDevice('Z-dim_button');
    this.triggerZDim_button
      .register();

    // Register conditions for flows
    this.conditionAlarmPower = new Homey.FlowCardCondition('alarm_power')
      .register()
      .registerRunListener((args, state) => {
        return args.device.getCapabilityValue('alarm_power');
      });

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
        return args.device.executeCapabilitySetCommand('thermofloor_mode', 'THERMOSTAT_MODE', thermostatMode);
        // return args.device.triggerCapabilityListener('thermofloor_mode', thermostatMode, {});
      });

    // Register actions for flows thermofloor_change_mode (Autocomplete)
    this._actionThermostatChangeMode = new Homey.FlowCardAction('thermostat_change_mode');
    this._actionThermostatChangeMode
      .getArgument('mode')
      .registerAutocompleteListener((query, args, callback) => args.device.onModeAutocomplete(query, args, callback));
    this._actionThermostatChangeMode
      .register()
      .registerRunListener((args, state) => {
        const thermostatMode = args.mode.id;
        args.device.log('FlowCardAction triggered for ', args.device.getName(), 'to change Thermostat mode to', thermostatMode);

        // Trigger the thermostat mode setParser
        return args.device.executeCapabilitySetCommand(args.mode.capability, 'THERMOSTAT_MODE', thermostatMode);
      });

    // Register actions for flows
    this._actionThermofloorChangeSetpoint = new Homey.FlowCardAction('thermofloor_change_mode_setpoint')
      .register()
      .registerRunListener(this._actionThermofloorChangeSetpointRunListener.bind(this));

    this._setPowerRegulatorMode = new Homey.FlowCardAction('thermofloor_set_PowerRegulatorMode')
      .register()
      .registerRunListener(this._setPowerRegulatorMode.bind(this));


    // Register actions for flows thermofloor_change_mode
    this._actionTurnOnSiren = new Homey.FlowCardAction('turnOnSiren')
      .register()
      .registerRunListener(this._actionTurnOnOffSirenRunListener.bind(this, true));

    // Register actions for flows thermofloor_change_mode
    this._actionTurnOffSiren = new Homey.FlowCardAction('turnOffSiren')
      .register()
      .registerRunListener(this._actionTurnOnOffSirenRunListener.bind(this, false));
  }

  async _actionTurnOnOffSirenRunListener(value, args) {
    if (args && args.device) {
      if (!args.device.hasCommandClass('BASIC')) throw new Error('device_does_not_support_alarm_siren');
      return args.device.executeCapabilitySetCommand('alarm_siren', 'BASIC', value);
    }
    throw new Error('missing_device_instance');
  }

  // thermofloor_change_mode_setpoint
  async _actionThermofloorChangeSetpointRunListener(args, state) {
    if (!args.hasOwnProperty('setpointMode')) return Promise.reject(new Error('setpointMode_property_missing'));
    if (!args.hasOwnProperty('setpointValue')) return Promise.reject(new Error('setpointValue_property_missing'));
    if (typeof args.setpointValue !== 'number') return Promise.reject(new Error('setpointValue_is_not_a_number'));

    args.device.log('FlowCardAction triggered for ', args.device.getName(), 'to change setpoint value', args.setpointValue, 'for mode', args.setpointMode);
    try {
      return await args.device.executeCapabilitySetCommand('target_temperature', 'THERMOSTAT_SETPOINT', args.setpointValue, { mode: args.setpointMode });
    } catch (error) {
      args.device.log(error.message);
      return Promise.reject(new Error(error.message));
    }
  }

  async _setPowerRegulatorMode(args, state) {
    if (!args.hasOwnProperty('set_power_regulator_mode')) return Promise.reject(new Error('set_power_regulator_mode_property_missing'));
    if (typeof args.set_power_regulator_mode !== 'number') return Promise.reject(new Error('set_power_regulator_mode_is_not_a_number'));
    if (args.set_forced_brightness_level > 10) return Promise.reject(new Error('set_power_regulator_mode_out_of_range'));

    try {
      const result = await args.device.configurationSet({
        id: 'P_setting',
      }, args.set_power_regulator_mode);
      return args.device.setSettings({
        P_setting: args.set_power_regulator_mode,
      });
    } catch (error) {
      args.device.log(error.message);
      return Promise.reject(new Error(error.message));
    }
  }

}

module.exports = HeatitApp;
