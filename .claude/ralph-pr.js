const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const base = 'master';
const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

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

async function main() {
  if (branch === base) {
    console.error(
      `Сейчас checkout'нута ветка '${base}' — переключись на рабочую ветку перед созданием PR.`,
    );
    process.exit(1);
  }

  const commits = execSync(`git log ${base}..HEAD --oneline`).toString().trim();
  if (!commits) {
    console.log(
      `В ветке '${branch}' нет коммитов, которых нет в '${base}'. Оформлять нечего.`,
    );
    return;
  }
  console.log(
    `Коммиты ветки '${branch}', которых нет в '${base}':\n${commits}\n`,
  );

  const existingPrs = JSON.parse(
    execSync(
      `gh pr list --head "${branch}" --state all --json number,state`,
    ).toString(),
  );
  const openPr = existingPrs.find((pr) => pr.state === 'OPEN');

  const mergeInstruction = `После ревью прими решение сам: если НЕТ блокирующих проблем (архитектура, безопасность, корректность) — самостоятельно смержи PR в '${base}' командой 'gh pr merge <номер> --squash --delete-branch' и подтверди в чате, что PR смержен. Если блокирующие проблемы есть — НЕ мерджи PR, оставь их как комментарии в PR через gh cli и явно напиши в чате, что мердж не выполнен и почему.`;

  const prompt = openPr
    ? `PR #${openPr.number} для ветки '${branch}' уже существует и открыт. Проведи детальное code review этого PR: архитектура, безопасность, производительность, соответствие PRD. Оставь все комментарии ревью прямо в PR через gh cli (gh pr review / gh pr comment / gh api), а не только в чате. ${mergeInstruction}`
    : `Ты в ветке '${branch}'. Собери коммиты, которых нет в '${base}' (git log ${base}..HEAD), запушь ветку если она ещё не запушена, и создай Pull Request в '${base}' через gh pr create с содержательным описанием на основе этих коммитов. Затем проведи детальное code review созданного PR: архитектура, безопасность, производительность, соответствие PRD. Оставь все комментарии ревью прямо в PR через gh cli (gh pr review / gh pr comment / gh api), а не только в чате. ${mergeInstruction}`;

  console.log(`🔍 Оформляем PR/ревью для ветки '${branch}'...`);
  await runLogged(`claude -p "${prompt}" --max-turns 100`, 'pr-review');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
