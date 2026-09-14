import { Label } from './ui/label';
import { SELF_LEVELS, normalizeSelfLevel } from '../lib/ranking';

export function RankingField({ id, defaultValue = 'Begynder' }: { id: string; defaultValue?: string }) {
  return <div className="grid gap-2">
    <Label htmlFor={id}>Egen ranking</Label>
    <select id={id} name="level" defaultValue={normalizeSelfLevel(defaultValue)} required
      className="h-10 rounded-md border border-input bg-transparent px-3">
      {SELF_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
    </select>
  </div>;
}
