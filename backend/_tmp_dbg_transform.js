require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validator } = require('class-validator');
const { ResolveMachineTargetQueryDto } = require('./dist/modules/machine-target/dto/machine-target.dto');

(async () => {
  const inst = plainToInstance(ResolveMachineTargetQueryDto, {
    machineId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    shiftId: '3f2504e0-4f89-11d3-9a0c-0305e82c3302',
    productionDate: '2026-08-22',
    allowGeneralFallback: 'false',
  }, { enableImplicitConversion: true });
  console.log('transformed value:', JSON.stringify(inst.allowGeneralFallback), typeof inst.allowGeneralFallback);
  const errs = await validator.validate(inst);
  console.log('validation errors:', errs.map((e) => e.property + ':' + JSON.stringify(e.constraints)));
})();
