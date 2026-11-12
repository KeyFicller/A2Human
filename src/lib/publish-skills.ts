export function canAddCustomSkill(skillCount: number) {
  return skillCount < 6
}

export function customSkillAddLabel(customCount: number): "customAdd" | "addSkill" {
  return customCount > 0 ? "addSkill" : "customAdd"
}
