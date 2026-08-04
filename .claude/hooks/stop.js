const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync('.claude/ralph.config.json', 'utf8'));

if (!config.active) {
  process.exit(0);
}

// Счётчик итераций и текущая фаза (индекс в config.phases)
const counterFile = '.claude/ralph.iterations.json';
let counter = { count: 0, phaseIndex: 0 };
if (fs.existsSync(counterFile)) {
  counter = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
}

// Запускает команду, показывая вывод в консоли и одновременно
// сохраняя его в файл — чтобы можно было разобрать, что произошло
// во вложенной сессии, даже если она не закоммитила/не закрыла Issue.
function runLogged(command, logName) {
  const logDir = '.claude/ralph-logs';
  fs.mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logDir, `${timestamp}-${logName}.log`);
  const logStream = fs.createWriteStream(logFile);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    child.on('close', (code) => {
      logStream.end();
      console.log(`📝 Лог сохранён: ${logFile}`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Команда завершилась с кодом ${code}: ${command}`));
      }
    });
  });
}

function getOpenIssues(milestone) {
  const output = execSync(
    `gh issue list --milestone "${milestone}" --state open --json number,title`,
  ).toString();
  return JSON.parse(output).sort((a, b) => a.number - b.number);
}

function isPrMerged(branch) {
  const output = execSync(
    `gh pr list --head "${branch}" --state merged --json number`,
  ).toString();
  return JSON.parse(output).length > 0;
}

async function runIssue(phase, issue) {
  counter.count++;
  fs.writeFileSync(counterFile, JSON.stringify(counter));
  console.log(
    `🔄 Итерация ${counter.count}/${config.maxIterations} — фаза ${counter.phaseIndex + 1}/${config.phases.length} (${phase.milestone}) — Issue #${issue.number}: ${issue.title}`,
  );

  const prompt = config.prompt
    .replace('{milestone}', phase.milestone)
    .replace('{branch}', phase.branch);
  await runLogged(
    `claude -p "${prompt}" --max-turns ${config.maxTurns}`,
    `issue-${issue.number}`,
  );
}

// Milestone текущей фазы закрыт: оформляем PR/ревью для её ветки. Если
// ревью не находит блокеров, агент сам мержит PR (см. ralph-pr.js) — только
// тогда переходим к следующей фазе. Если PR остался немержен, продолжать
// нет смысла (следующая фаза будет ветвиться от master без этого кода) —
// цикл останавливается на текущей фазе.
async function finishPhaseAndAdvance(phase) {
  let merged = isPrMerged(phase.branch);

  if (!merged) {
    console.log(
      `🔍 Milestone "${phase.milestone}" завершён. Запускаем финальное ревью и PR для ветки '${phase.branch}'...`,
    );
    execSync(`git checkout "${phase.branch}"`, { stdio: 'inherit' });
    await runLogged(
      'node .claude/ralph-pr.js',
      `final-review-phase-${counter.phaseIndex + 1}`,
    );
    merged = isPrMerged(phase.branch);
  }

  if (!merged) {
    // Ревью нашло блокирующие проблемы (или PR ещё не создан/не готов) —
    // не переходим дальше, чтобы следующая фаза не стартовала без этого кода.
    config.active = false;
    fs.writeFileSync(
      '.claude/ralph.config.json',
      JSON.stringify(config, null, 2),
    );
    console.log(
      `⏸️ PR для ветки '${phase.branch}' не смержен — Ralph останавливается на фазе ${counter.phaseIndex + 1}/${config.phases.length}. Разберись с блокерами и запусти ralph-start.js, чтобы продолжить с этой же фазы.`,
    );
    return;
  }

  // PR смержен — подтягиваем свежий master, чтобы следующая фаза ветвилась от него
  execSync('git checkout master', { stdio: 'inherit' });
  execSync('git pull', { stdio: 'inherit' });

  const nextPhaseIndex = counter.phaseIndex + 1;
  if (nextPhaseIndex >= config.phases.length) {
    // Все milestone'ы закрыты — выключаем цикл, чтобы Stop Hook не мог
    // повторно запуститься и зациклиться на этом шаге.
    config.active = false;
    fs.writeFileSync(
      '.claude/ralph.config.json',
      JSON.stringify(config, null, 2),
    );
    fs.writeFileSync(counterFile, JSON.stringify({ count: 0, phaseIndex: 0 }));
    console.log("✅ Все milestone'ы завершены. Ralph останавливается.");
    return;
  }

  counter.phaseIndex = nextPhaseIndex;
  fs.writeFileSync(counterFile, JSON.stringify(counter));
  const nextPhase = config.phases[nextPhaseIndex];
  console.log(
    `➡️ Переходим к фазе ${nextPhaseIndex + 1}/${config.phases.length}: ${nextPhase.milestone} (ветка '${nextPhase.branch}')`,
  );
  await main();
}

async function main() {
  // Общий предохранитель на весь прогон (все фазы вместе), а не на одну фазу
  if (counter.count >= config.maxIterations) {
    console.log(
      `⛔ Достигнут лимит итераций (${config.maxIterations}). Ralph останавливается — запусти ralph-start.js, чтобы продолжить.`,
    );
    return;
  }

  if (counter.phaseIndex >= config.phases.length) {
    config.active = false;
    fs.writeFileSync(
      '.claude/ralph.config.json',
      JSON.stringify(config, null, 2),
    );
    return;
  }

  const phase = config.phases[counter.phaseIndex];
  const issues = getOpenIssues(phase.milestone);

  if (issues.length > 0) {
    await runIssue(phase, issues[0]);
  } else {
    await finishPhaseAndAdvance(phase);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
