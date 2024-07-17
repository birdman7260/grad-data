import { possibleSliceType, possibleTagType } from '../../common/enums';

export const isFinalByType = (data: unknown): data is FinalByType => {
  if (!data) return false;
  if (typeof data !== 'object') return false;
  for (const [key, val] of Object.entries(data)) {
    if (!possibleTagType.includes(key as TagType)) return false;
    if (!val || typeof val !== 'object') return false;
    if (!possibleSliceType.every((t) => t in val)) return false;
    if ('project' in val) return false;
  }
  return true;
};

export const isFinalByGroup = (data: unknown): data is FinalByGroup => {
  if (!data) return false;
  if (typeof data !== 'object') return false;
  for (const [project, projVal] of Object.entries(data)) {
    if (typeof project !== 'string') return false;
    if (
      projVal === undefined ||
      projVal === null ||
      typeof projVal !== 'object'
    )
      return false;

    for (const [description, descVal] of Object.entries(projVal)) {
      if (typeof description !== 'string') return false;
      if (typeof descVal === 'number') continue;
      if (!!descVal && typeof descVal === 'object' && 'description' in descVal)
        continue;
      return false;
    }
  }

  return true;
};

export const isFinalByProject = (data: unknown): data is FinalByProject => {
  if (!data) return false;
  if (typeof data !== 'object') return false;
  for (const [project, projVal] of Object.entries(data)) {
    if (typeof project !== 'string') return false;
    if (typeof projVal === 'number') continue;
    if (
      !!projVal &&
      typeof projVal === 'object' &&
      'project' in projVal &&
      !('description' in projVal)
    )
      continue;
    return false;
  }

  return true;
};
