const { execSync } = require('child_process');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('.claude/ralph.config.json', 'utf8'));

if (!config.phases || config.phases.length === 0) {
  throw new Error("ralph.config.json: список 'phases' пуст — нечего запускать");
}

// Если предыдущий прогон остановился в середине (лимит итераций или
// немерженный PR — см. stop.js), продолжаем с той же фазы, а не с нуля:
// её ветка может быть уже смержена и удалена, повторный checkout сломается.
const counterFile = '.claude/ralph.iterations.json';
let phaseIndex = 0;
if (fs.existsSync(counterFile)) {
  try {
    phaseIndex =
      JSON.parse(fs.readFileSync(counterFile, 'utf8')).phaseIndex || 0;
  } catch {
    phaseIndex = 0;
  }
}
if (phaseIndex >= config.phases.length) {
  phaseIndex = 0;
}

// Сбрасываем только счётчик итераций (свежий лимит на продолжение)
fs.writeFileSync(counterFile, JSON.stringify({ count: 0, phaseIndex }));

// Включаем цикл, чтобы Stop Hook продолжал брать Issues и сам переходил
// между milestone'ами, пока не закроет все фазы из config.phases
config.active = true;
fs.writeFileSync('.claude/ralph.config.json', JSON.stringify(config, null, 2));

const phase = config.phases[phaseIndex];
const prompt = config.prompt
  .replace('{milestone}', phase.milestone)
  .replace('{branch}', phase.branch);
console.log(
  `🚀 Запускаем Ralph: фаза ${phaseIndex + 1}/${config.phases.length} — milestone: ${phase.milestone}`,
);

execSync(`claude -p "${prompt}" --max-turns ${config.maxTurns}`, {
  stdio: 'inherit',
});
