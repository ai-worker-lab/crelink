// .omp/agents/*.md의 frontmatter에서 역할 이름과 소유 경로(owns)를 읽습니다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} agentsDir
 * @returns {Map<string, { name: string, file: string, owns: string[] }>}
 */
export function loadAgents(agentsDir) {
  const agents = new Map();
  for (const file of readdirSync(agentsDir)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    const text = readFileSync(join(agentsDir, file), 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
    const field = (key) => new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm').exec(frontmatter)?.[1];
    const name = field('name');
    if (!name) continue;
    const owns = (field('owns') ?? '')
      .replace(/^["']|["']$/g, '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    agents.set(name, { name, file: join(agentsDir, file), owns });
  }
  return agents;
}
