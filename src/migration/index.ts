/**
 * Everything that reads data older than the canonical formats. Used only by
 * the places that take data from outside (lab boot, library, project import,
 * file import); never by the runtime, the exporters or anything that creates
 * new data.
 */
import { parseDefinition, type DefinitionImport } from '../components/definition';
import { COMPONENT_V1_FORMAT, convertComponentV1 } from './component-v1';

export * from './legacy';
export { COMPONENT_V1_FORMAT, convertComponentV1 } from './component-v1';

/** Reads a component in any format Jello has written: the canonical definition, or `jello-component` v1 (converted). */
export function importComponent(input: unknown): DefinitionImport {
  if (typeof input === 'object' && input !== null && (input as { format?: unknown }).format === COMPONENT_V1_FORMAT) return convertComponentV1(input);
  return parseDefinition(input);
}

export function importComponentText(text: string): DefinitionImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON non valido: ${(e as Error).message}`] };
  }
  return importComponent(data);
}
