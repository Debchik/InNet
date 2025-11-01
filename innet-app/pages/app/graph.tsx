import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import {
  buildGraphData,
  loadContacts,
  type GraphData,
} from '../../lib/storage';
import type {
  ForceGraphMethods,
  NodeObject,
  LinkObject,
} from 'react-force-graph-2d';

const ForceGraph2D = dynamic(
  () => import('react-force-graph-2d').then((mod) => mod.default),
  { ssr: false }
) as unknown as typeof import('react-force-graph-2d').default;
const SINGLE_NODE_ZOOM = 4.2;
const FALLBACK_NODE_COLOR = '#818CF8';

const withAlpha = (hex: string | undefined, alpha: number) => {
  if (!hex || !hex.startsWith('#')) {
    return `rgba(129, 140, 248, ${alpha})`;
  }
  const value = hex.replace('#', '');
  const base = value.slice(0, 6);
  const alphaHex = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${base}${alphaHex}`;
};

type PositionedNode = GraphData['nodes'][number] & {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};

type PositionedGraph = GraphData & {
  nodes: PositionedNode[];
};

type GraphNode = NodeObject<PositionedNode>;
type GraphLink = LinkObject<PositionedNode, GraphData['links'][number]>;

function getNodeLevel(node: GraphData['nodes'][number]): number {
  if (typeof node.level === 'number') return node.level;
  if (node.id === 'me') return 0;
  return 1;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function createNoiseGenerator(key: string): () => number {
  let seed = hashString(key) || 0x1f123bb5;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layoutGraph(data: GraphData, width: number, height: number): PositionedGraph {
  const rawNodes = data.nodes ?? [];
  if (!rawNodes.length) {
    return { ...data, nodes: [] };
  }

  const w = Math.max(width, 320);
  const h = Math.max(height, 320);
  const minDimension = Math.min(w, h);
  const others = rawNodes
    .filter((node) => getNodeLevel(node) > 0)
    .sort((a, b) => {
      const levelA = getNodeLevel(a);
      const levelB = getNodeLevel(b);
      if (levelA !== levelB) return levelA - levelB;
      const nameA = (a.name ?? '').toString();
      const nameB = (b.name ?? '').toString();
      const nameComparison = nameA.localeCompare(nameB);
      if (nameComparison !== 0) return nameComparison;
      const idA = String(a.id);
      const idB = String(b.id);
      return idA.localeCompare(idB);
    });

  const positions = new Map<string, { x: number; y: number }>();
  const baseRadius = Math.max(minDimension * 0.26, 140);
  const ringGap = Math.max(minDimension * 0.18, 110);
  const ringShiftMagnitude = Math.max(minDimension * 0.05, 32);
  const localShiftMagnitude = Math.max(minDimension * 0.02, 10);

  let offset = 0;
  let ringIndex = 0;

  while (offset < others.length) {
    const remaining = others.length - offset;
    const capacity = Math.min(remaining, Math.max(6, 8 + ringIndex * 6));
    const radius = baseRadius + ringIndex * ringGap;
    const ringNoise = createNoiseGenerator(`ring-${ringIndex}-${capacity}`);
    const ringShiftX = (ringNoise() - 0.5) * ringShiftMagnitude;
    const ringShiftY = (ringNoise() - 0.5) * ringShiftMagnitude;

    for (let i = 0; i < capacity && offset + i < others.length; i += 1) {
      const node = others[offset + i];
      const baseAngle = (2 * Math.PI * i) / capacity;
      const nodeNoise = createNoiseGenerator(`node-${node.id}-${ringIndex}`);
      const angleJitter = (nodeNoise() - 0.5) * (2 * Math.PI / Math.max(capacity, 8));
      const radialJitter = (nodeNoise() - 0.5) * Math.min(ringGap * 0.6, radius * 0.25);
      const shiftX = (nodeNoise() - 0.5) * localShiftMagnitude;
      const shiftY = (nodeNoise() - 0.5) * localShiftMagnitude;
      const angle = baseAngle + angleJitter;
      const distance = radius + radialJitter;
      const x = ringShiftX + distance * Math.cos(angle) + shiftX;
      const y = ringShiftY + distance * Math.sin(angle) + shiftY;
      positions.set(node.id, { x, y });
    }

    offset += capacity;
    ringIndex += 1;
  }

  return {
    ...data,
    nodes: rawNodes.map((node) => {
      if (getNodeLevel(node) === 0) {
        return { ...node, x: 0, y: 0, fx: 0, fy: 0 };
      }
      const pos = positions.get(node.id);
      if (!pos) return node;
      return { ...node, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y };
    }),
  };
}

export default function GraphPage() {
  const router = useRouter();
  const [graphData, setGraphData] = useState<GraphData>(() => ({
    nodes: [],
    links: [],
  }));
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const refreshGraph = useCallback(() => {
    if (typeof window === 'undefined') return;
    setGraphData(buildGraphData('me', loadContacts()));
  }, []);

  useEffect(() => {
    refreshGraph();
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'innet_contacts') {
        refreshGraph();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refreshGraph);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshGraph);
    };
  }, [refreshGraph]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(() => update());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const nodeId = typeof node.id === 'number' ? String(node.id) : node.id;
      const level = typeof node.level === 'number' ? node.level : nodeId === 'me' ? 0 : 1;
      if (!nodeId || level === 0 || level >= 2) return;
      router.push(`/app/contacts/${nodeId}`);
    },
    [router]
  );

  const width = useMemo(() => Math.max(1, dimensions.width), [dimensions.width]);
  const height = useMemo(() => Math.max(1, dimensions.height), [dimensions.height]);
  const positionedGraph = useMemo(
    () => layoutGraph(graphData, width, height),
    [graphData, width, height]
  );
  const onlyRoot = positionedGraph.nodes.length <= 1;

  const focusGraph = useCallback(() => {
    const api = fgRef.current;
    if (!api || !dimensions.width || !dimensions.height) return;

    const nodes = positionedGraph.nodes ?? [];
    if (!nodes.length) return;

    if (nodes.length === 1) {
      const node = nodes[0];
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      api.centerAt?.(x, y, 600);
      api.zoom?.(SINGLE_NODE_ZOOM, 600);
      return;
    }

    const padding = Math.min(dimensions.width, dimensions.height) * 0.08;
    api.zoomToFit?.(800, padding);
  }, [dimensions.height, dimensions.width, positionedGraph]);

  useEffect(() => {
    if (!graphData.nodes.length || graphData.nodes.length <= 1) return;
    const timeout = setTimeout(() => {
      focusGraph();
    }, 250);
    return () => clearTimeout(timeout);
  }, [graphData, focusGraph]);

  return (
    <Layout>
      <div className="flex flex-1 flex-col min-h-0 bg-slate-950">
        <div className="shrink-0 border-b border-slate-800/80 bg-slate-950/80 px-6 py-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-50">Моя сеть</h1>
            <p className="mt-1 text-sm text-slate-400">
              Карта ваших контактов занимает всё пространство — масштаб и положение подстраиваются автоматически.
            </p>
          </div>
        </div>
        <div ref={containerRef} className="relative flex-1 min-h-[360px] overflow-hidden bg-slate-950">
          {onlyRoot ? (
            <EmptyState />
          ) : (
            <ForceGraph2D
              ref={fgRef}
              width={width}
              height={height}
              backgroundColor="#0B1120"
              graphData={positionedGraph}
              cooldownTicks={0}
              onNodeClick={handleNodeClick}
              onEngineStop={focusGraph}
              linkColor={() => '#1E293B'}
              linkWidth={1.25}
              linkDirectionalParticles={0}
              nodeRelSize={6}
              enableZoomInteraction
              nodeLabel={(node: GraphNode) => node.name ?? ''}
              nodeCanvasObject={(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
                const level = typeof node.level === 'number' ? node.level : node.id === 'me' ? 0 : 1;
                const isRoot = level === 0;
                const isSecondLevel = level >= 2;
                const radius = isRoot ? 18 : isSecondLevel ? 10 : 12;
                const baseColor = isRoot
                  ? '#38BDF8'
                  : isSecondLevel
                    ? '#22C55E'
                    : (typeof node.tagColor === 'string' && node.tagColor) || FALLBACK_NODE_COLOR;
                const haloColor = isRoot
                  ? withAlpha(baseColor, 0.45)
                  : withAlpha(baseColor, isSecondLevel ? 0.3 : 0.25);

                ctx.save();
                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, radius + 3, 0, 2 * Math.PI, false);
                ctx.fillStyle = haloColor;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = baseColor;
                ctx.fill();

                const label = node.name ?? '';
                if (!label) return;
                const fontSize = Math.max(12, 20 / globalScale);
                ctx.font = `${fontSize}px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const textWidth = ctx.measureText(label).width;
                const paddingX = 6;
                const paddingY = 4;
                const labelX = (node.x ?? 0) - textWidth / 2 - paddingX;
                const labelY = (node.y ?? 0) + radius + 8;

                ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
                ctx.fillRect(labelX, labelY, textWidth + paddingX * 2, fontSize + paddingY * 2);

                ctx.fillStyle = '#F8FAFC';
                ctx.fillText(label, node.x ?? 0, labelY + paddingY);
                ctx.restore();
              }}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center text-slate-300">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-cyan-500/10 blur-xl" />
        <span className="absolute inset-6 rounded-full border border-cyan-400/40" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500 text-lg font-semibold text-slate-950 shadow-lg">
          Вы
        </span>
      </div>
      <div className="max-w-md space-y-2">
        <p className="text-lg font-medium text-slate-100">Здесь пока только вы</p>
        <p className="text-sm text-slate-400">
          Добавьте друзей через раздел «QR» или импортируйте их в контактах — и сеть оживёт узлами и связями.
        </p>
      </div>
    </div>
  );
}
