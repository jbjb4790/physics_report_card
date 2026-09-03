const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const ids = [
  'motion-graphs','forces-equilibrium','energy-spring','momentum-collision',
  'circular-oscillation','fluid-buoyancy','electrostatics','circuits',
  'magnetism','induction','waves-sound','refraction-tir',
  'mirrors-lenses','light-color-quantum','thermal-balance','heat-transfer',
  'gas-thermodynamics','thermal-expansion'
];

function simpleQuestion(id, seed) {
  const number = Math.abs([...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0)) % 9 + 1;
  return {
    conceptId:id, concept:'기본문항', difficulty:'중',
    stem:`${id} 기본 연습 ${seed}`,
    choices:[`${number}`,`${number+1}`,`${number+2}`,`${number+3}`,`${number+4}`],
    answer:0, explanation:`기본 해설 ${number}`, formula:'기본 공식'
  };
}

const groups = Object.fromEntries(ids.map(id => [id, {
  name:id, domain:'test', formulas:['F'], tip:'tip'
}]));

const context = {
  window: {
    YPWeakQuestionFactory: {
      version:'3.11.1',
      groups,
      resolveId:(id)=>groups[id]?id:'motion-graphs',
      createRng:(seed)=>{
        let s=1;
        for(const c of String(seed)) s=(s*31+c.charCodeAt(0))>>>0;
        return ()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
      },
      generateQuestion:simpleQuestion
    }
  },
  globalThis:null, console, Math, Date, Set, Map
};
context.globalThis=context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','site','assets','weak-unit-hard-mode.js'),'utf8'),context);

const factory=context.window.YPWeakQuestionFactory;
assert.strictEqual(factory.hardModeVersion,'3.12.1');

for(const id of ids){
  for(let seed=0;seed<30;seed++){
    const set=factory.generateSet(id,20,`${id}-${seed}`);
    assert.strictEqual(set.questions.length,20,`${id} question count`);
    for(const q of set.questions){
      assert.ok(['중상','상'].includes(q.difficulty),`${id} difficulty`);
      assert.strictEqual(q.choices.length,5,`${id} choices`);
      assert.strictEqual(new Set(q.choices).size,5,`${id} unique choices`);
      assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<5,`${id} answer`);
      assert.ok(q.explanation.length>8,`${id} explanation`);
    }
  }
}
console.log('hard_mode.test.js: all assertions passed');