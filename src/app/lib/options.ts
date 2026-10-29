import type { RecoveryOption } from '../../engine/recovery';
import type { Dataset } from '../../engine/types';
import { num, partName } from './format';

/** A plain-language name for an option; the engine's id-based title is kept as a subtitle. */
export function optionName(o: RecoveryOption, data: Dataset): string {
  if (o.type === 'transfer') {
    const src = data.deliveries.find((d) => d.id === o.from);
    return `Borrow ${num(o.qty)} ${partName(data, o.part)}s from the ${src?.forChipset ?? 'other'} order`;
  }
  if (o.type === 'substitute') return `Build ${o.chipset} test boards with the alternative ${partName(data, o.sub.part).replace(/ \(alt\. supplier\)/, '')}`;
  const m = data.models.find((x) => x.id === o.model);
  return `Move the ${m?.name ?? o.model} launch ${o.days} days later`;
}
