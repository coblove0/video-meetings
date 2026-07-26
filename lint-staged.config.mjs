import path from 'node:path';

function eslintCommand(workspace, dir) {
  return (filenames) => {
    const files = filenames
      .map((f) => path.relative(path.resolve(dir), f))
      .map((f) => JSON.stringify(f));
    return `npm exec -w ${workspace} -- eslint --fix ${files.join(' ')}`;
  };
}

export default {
  'apps/web/**/*.{js,jsx,mjs,ts,tsx}': eslintCommand('web', 'apps/web'),
  'apps/api/**/*.ts': eslintCommand('api', 'apps/api'),
};
