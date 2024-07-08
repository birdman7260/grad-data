/**
 * Well i thought this would be an awesome chart but when i actually get it data
 * it turned out to kind of suck lol
 */

import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

type Coord = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  depth: number;
};

type Datum = {
  name: string;
  children?: Datum[];
  value?: number;
  target?: Coord;
  current?: Coord;
};

type SunburstProps = {
  data: Datum;
};

function arcVisible(d?: Coord) {
  if (d === undefined) return false;

  const ret = d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  return ret;
}

function labelVisible(d?: Coord) {
  if (d === undefined) return false;

  return d.y1 <= 3 && d.y0 >= 1 && d.x1 - d.x0 > 0.03;
}

function labelTransform(radius: number, d?: Coord) {
  if (d === undefined) return '';

  const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
  const y = ((d.y0 + d.y1) / 2) * radius;
  return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
}

// TODO: show the total value in the center of the chart, changing to the selected project total
// TODO: change the values to be readable
export default function Sunburst({ data }: SunburstProps) {
  // Specify the chart's dimensions.
  const width = 928;
  const height = width;
  const radius = width / 6;

  const g1 = useRef(null);
  const g2 = useRef(null);
  const c1 = useRef(null);

  useEffect(() => {
    // Create the color scale.
    const color = d3.scaleOrdinal(
      d3.quantize(d3.interpolateRainbow, data.children?.length ?? 0 + 1),
    );

    // Compute the layout.
    const hierarchy = d3
      .hierarchy<Datum>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const root = d3
      .partition<Datum>()
      .size([2 * Math.PI, hierarchy.height + 1])(hierarchy);

    root.each((d) => (d.data.current = d));

    // Create the arc generator.
    const arc = d3
      .arc<Coord>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius * 1.5)
      .innerRadius((d) => d.y0 * radius)
      .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));

    const path = d3
      .select(g1.current)
      .selectAll('path')
      .data(root.descendants().slice(1))
      .join('path')
      .attr('fill', (d) => {
        while (d.depth > 1 && d.parent) d = d.parent;
        return color(d.data.name);
      })
      .attr('fill-opacity', (d) =>
        arcVisible(d.data.current) ? (d.children ? 0.6 : 0.4) : 0,
      )
      .attr('pointer-events', (d) =>
        arcVisible(d.data.current) ? 'auto' : 'none',
      )
      .attr('d', (d) => {
        if (d.data.current !== undefined) {
          return arc(d.data.current);
        }
        return null;
      });

    // Make them clickable if they have children.
    path
      .filter((d) => !!d.children)
      .style('cursor', 'pointer')
      .on('click', clicked);

    // const format = d3.format(',d');
    // path.append('title').text(
    //   (d) =>
    //     `${d
    //       .ancestors()
    //       .map((d) => d.data.name)
    //       .reverse()
    //       .join('/')}\n${format(d.value ?? 0)}`,
    // );

    const label = d3
      .select(g2.current)
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .style('user-select', 'none')
      .selectAll('text')
      .data(root.descendants().slice(1))
      .join('text')
      .attr('dy', '0.35em')
      .attr('fill-opacity', (d) => +labelVisible(d.data.current))
      .attr('transform', (d) => labelTransform(radius, d.data.current))
      .text((d) => `${d.data.name}\n${d.value}`);
    const parent = d3.select(c1.current).datum(root).on('click', clicked);

    // Handle zoom on click.
    function clicked(_: MouseEvent, p: d3.HierarchyRectangularNode<Datum>) {
      parent.datum(p.parent ?? root);

      let c = 0;

      root.each((d) => {
        d.data.target = {
          x0:
            Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          x1:
            Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth),
          depth: d.depth,
        };
        c += +(d.data.target.x0 === d.x0 && d.data.target.x1 === d.x1);
      });

      console.log(c);

      const t = d3.transition().duration(750);

      // Transition the data on all arcs, even the ones that aren't visible,
      // so that if this transition is interrupted, entering arcs will start
      // the next transition from the desired position.
      path
        .transition(t)
        .tween('data', (d) => {
          const i = d3.interpolate<Coord>(d.data.current, d.data.target!);
          return (t) => (d.data.current = i(t));
        })
        .filter(function (d) {
          if (this !== null && 'getAttribute' in this) {
            const fo = this.getAttribute('fill-opacity');
            if (fo !== null) {
              return +fo !== 0 || arcVisible(d.data.target);
            }
          }

          return arcVisible(d.data.target);
        })
        .attr('fill-opacity', (d) =>
          arcVisible(d.data.target) ? (d.children ? 0.6 : 0.4) : 0,
        )
        .attr('pointer-events', (d) =>
          arcVisible(d.data.target) ? 'auto' : 'none',
        )
        .attrTween('d', (d) => () => {
          if (d.data.current !== undefined) {
            return arc(d.data.current) ?? '';
          }
          return '';
        });

      label
        .filter(function (d) {
          if (this && 'getAttribute' in this) {
            const fo = this.getAttribute('fill-opacity');
            if (fo !== null) {
              return +fo !== 0 || labelVisible(d.data.target);
            }
          }

          return labelVisible(d.data.target);
        })
        .transition(t)
        .attr('fill-opacity', (d) => +labelVisible(d.data.target))
        .attrTween(
          'transform',
          (d) => () => labelTransform(radius, d.data.current),
        );
    }
  }, [data, g1, g2, c1, radius]);

  return (
    <svg
      viewBox={`${-width / 2},${-height / 2},${width},${width}`}
      fontStyle={'10px sans-serif'}
    >
      <g ref={g1} />
      <g ref={g2} />
      <circle ref={c1} r={radius} fill='none' pointerEvents={'all'} />
    </svg>
  );
}
