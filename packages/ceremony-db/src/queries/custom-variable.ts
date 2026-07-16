import type { SqlExecutor } from '../sql-executor.js';
import type { CustomVariable, CustomVariableRule } from '@sky-app/slide-shared';

interface CustomVariableRow {
  id: string;
  key: string;
  label: string;
  default_value: string;
}

interface CustomVariableRuleRow {
  id: string;
  custom_variable_id: string;
  attr: string;
  op: string;
  val: string;
  result: string;
}

export function getCustomVariables(executor: SqlExecutor, ceremonyId: number): CustomVariable[] {
  const variables = executor.query<CustomVariableRow>(
    'SELECT id, key, label, default_value FROM custom_variable WHERE ceremony_id = ? ORDER BY order_index',
    [ceremonyId],
  );
  const rules = executor.query<CustomVariableRuleRow>(
    `SELECT r.id, r.custom_variable_id, r.attr, r.op, r.val, r.result
     FROM custom_variable_rule r
     JOIN custom_variable v ON v.id = r.custom_variable_id
     WHERE v.ceremony_id = ?
     ORDER BY r.order_index`,
    [ceremonyId],
  );
  return variables.map((v) => ({
    id: v.id,
    key: v.key,
    label: v.label,
    default: v.default_value,
    rules: rules
      .filter((r) => r.custom_variable_id === v.id)
      .map((r): CustomVariableRule => ({ id: r.id, attr: r.attr, op: r.op as CustomVariableRule['op'], val: r.val, result: r.result })),
  }));
}

export function replaceCustomVariables(executor: SqlExecutor, ceremonyId: number, variables: CustomVariable[]): void {
  executor.run('DELETE FROM custom_variable WHERE ceremony_id = ?', [ceremonyId]);
  variables.forEach((v, index) => {
    executor.run(
      'INSERT INTO custom_variable (id, ceremony_id, key, label, default_value, order_index) VALUES (?, ?, ?, ?, ?, ?)',
      [String(v.id), ceremonyId, v.key, v.label, v.default, index],
    );
    v.rules.forEach((r, ruleIndex) => {
      executor.run(
        'INSERT INTO custom_variable_rule (id, custom_variable_id, attr, op, val, result, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [String(r.id), String(v.id), r.attr, r.op, r.val, r.result, ruleIndex],
      );
    });
  });
}
