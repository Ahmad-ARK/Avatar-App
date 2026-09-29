import { generateImage as callModal } from './modalFluxService.js';

export function generationAllowed(scene) {
  const text = `${scene.visual_query || ''} ${scene.entityName || ''}`;
  const personCategory = scene.visualCategory === 'person_reference' || scene.realPersonRelevant === true;
  const personTerms = /\b(celebrity|actor|actress|president|prime minister|king|queen|singer|politician|real person|portrait of)\b/i.test(text);
  return !(personCategory || personTerms);
}
export async function generateSceneImage(scene, outputPath, options = {}) {
  if (!generationAllowed(scene)) throw new Error('AI portraits of real personalities are disabled');
  return callModal(scene.visual_query, outputPath, options);
}

