/**
 * The lab's only way to draw icon markup that comes from a document (a
 * project's assets, a component's icon). The body goes through the SVG
 * allowlist of `components/icons` and is drawn as React elements from the
 * resulting tree: markup is never inserted as HTML. Markup the allowlist
 * refuses draws an empty icon.
 */

import { useMemo, type SVGProps } from 'react';
import { validateSvgBody, type SvgNode } from '../../components/icons';

export function SvgNodes({ nodes }: { nodes: readonly SvgNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        const Tag = n.tag as 'path';
        const attrs = Object.fromEntries(n.attrs.map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
        return (
          <Tag key={i} {...attrs}>
            {n.children.length ? <SvgNodes nodes={n.children} /> : null}
          </Tag>
        );
      })}
    </>
  );
}

type SvgProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children' | 'dangerouslySetInnerHTML'>;

/** An icon of the project's assets: `viewBox` and `body` as stored, validated before drawing. */
export function SafeSvg({ viewBox, body, ...props }: SvgProps & { viewBox: string; body: string }) {
  const r = useMemo(() => validateSvgBody(viewBox, body), [viewBox, body]);
  if (!r.ok) return <svg {...props} viewBox="0 0 24 24" data-invalid="true" />;
  return (
    <svg {...props} viewBox={r.viewBox}>
      <SvgNodes nodes={r.nodes} />
    </svg>
  );
}
