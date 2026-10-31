/** Canonical edits shared by the independent React and Vanilla consumer fixtures. */
export function desktopConsumerFixture(c, family) {
  let doc = c.componentTemplate('desktop-navbar').create();
  doc = c.updateNavbarItem(doc, 'brand', { label: 'Studio', icon: { kind: 'builtin', name: 'star' }, accessibleLabel: 'Studio home' });
  doc = c.setNavbarItemStyle(doc, 'brand', 'fontSize', 18);
  const group = c.addNavbarGroup(doc, 'Workspace');
  doc = c.moveNavbarItemToGroup(group.definition, 'explore', group.id);
  doc = c.moveNavbarItemToGroup(doc, 'projects', group.id);
  doc = c.moveNavbarItem(doc, 'projects', 0);
  doc = c.setNavbarItemAction(doc, 'settings', { kind: 'navigate', href: '#settings' });
  doc = c.setNavbarItemAction(doc, 'action', { kind: 'consumer', name: 'create-project' });
  doc = c.setDesktopNavbarField(doc, 'layout.height', 80);
  doc = c.setDesktopNavbarField(doc, 'layout.gap', 12);
  doc = c.setDesktopNavbarField(doc, 'layout.distribution', 'center');
  doc = c.switchMaterialFamily(doc, family).definition;
  return { ...doc, name: `Desktop ${family}` };
}
