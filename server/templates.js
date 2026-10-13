import { ApiError } from './validation.js';

const dimension = (label, defaultValue, min, max) => ({ label, default: defaultValue, min, max, unit: 'mm' });
export const templates = [
  {
    id: 'bracket', name: 'Bracket', description: 'Mount and support at a right angle.',
    reference: 'L-shaped mounting bracket', dimensions: '40 × 40 × 30 mm', version: 1,
    parameters: {
      height: dimension('Vertical leg', 40, 10, 200), depth: dimension('Horizontal leg', 40, 10, 200),
      width: dimension('Width', 30, 10, 200), thickness: dimension('Thickness', 4, 1, 20),
      holeDiameter: dimension('Centered screw hole diameter on each leg', 5, 0, 20),
    },
  },
  {
    id: 'enclosure', name: 'Enclosure', description: 'Give your electronics a home.',
    reference: 'Open electronics enclosure', dimensions: '80 × 60 × 30 mm', version: 1,
    parameters: {
      width: dimension('Outer width', 80, 10, 300), depth: dimension('Outer depth', 60, 10, 300),
      height: dimension('Outer height', 30, 5, 200), wallThickness: dimension('Wall and floor thickness', 3, 1, 20),
    },
  },
  {
    id: 'spacer', name: 'Spacer', description: 'Keep a precise distance between parts.',
    reference: 'Cylindrical through-hole spacer', dimensions: 'Ø 16 × 12 mm', version: 1,
    parameters: {
      outerDiameter: dimension('Outer diameter', 16, 3, 100),
      innerDiameter: dimension('Through-hole diameter', 5, 0, 80), height: dimension('Height', 12, 1, 200),
    },
  },
];

export function getTemplate(id) {
  const template = templates.find(item => item.id === id);
  if (!template) throw new ApiError(404, 'Template not found', 'NOT_FOUND');
  return template;
}

// Partial parameter sets are completed with defaults before validation/storage.
export function validateParameters(template, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(422, 'parameters must be an object', 'VALIDATION_ERROR');
  }
  const issues = [];
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(template.parameters, key)) issues.push({ field: `parameters.${key}`, message: 'Unknown parameter' });
  }
  const result = {};
  for (const [key, rule] of Object.entries(template.parameters)) {
    const value = Object.hasOwn(input, key) ? input[key] : rule.default;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.min || value > rule.max) {
      issues.push({ field: `parameters.${key}`, message: `Must be a finite number between ${rule.min} and ${rule.max} mm` });
    }
    result[key] = value;
  }
  const issue = (field, message) => issues.push({ field: `parameters.${field}`, message });
  if (!issues.length) {
    if (template.id === 'bracket') {
      if (2 * result.thickness >= Math.min(result.height, result.depth)) issue('thickness', 'Must be less than half of either leg');
      if (result.holeDiameter > 0 && result.holeDiameter + 2 * result.thickness >= Math.min(result.width, result.height, result.depth)) {
        issue('holeDiameter', 'Hole must leave more than a thickness of material on each side');
      }
    }
    if (template.id === 'enclosure') {
      if (2 * result.wallThickness >= Math.min(result.width, result.depth) || result.wallThickness >= result.height) {
        issue('wallThickness', 'Must leave an open interior and positive cavity height');
      }
    }
    if (template.id === 'spacer' && result.outerDiameter - result.innerDiameter < 2) {
      issue('innerDiameter', 'Must leave at least 1 mm of radial wall thickness');
    }
  }
  if (issues.length) throw new ApiError(422, 'Invalid template parameters', 'VALIDATION_ERROR', issues);
  return result;
}
