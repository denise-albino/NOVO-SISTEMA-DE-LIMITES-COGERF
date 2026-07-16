const { distribuirIgualCalc } = require('../assets/js/limites.js');

describe('distribuirIgualCalc', ()=>{
  test('distribui 1000.00 corretamente somando exatos 1000.00', ()=>{
    const arr = distribuirIgualCalc(1000.00);
    const soma = arr.reduce((s,v)=>s+v,0);
    expect(soma).toBeCloseTo(1000.00, 2);
    expect(arr.length).toBe(12);
  });

  test('distribui valores com centavos (100.05) exatamente', ()=>{
    const arr = distribuirIgualCalc(100.05);
    const soma = arr.reduce((s,v)=>s+v,0);
    expect(soma).toBeCloseTo(100.05, 2);
  });

  test('valor zero retorna zeros', ()=>{
    const arr = distribuirIgualCalc(0);
    expect(arr.every(v=>v===0)).toBe(true);
  });
});
