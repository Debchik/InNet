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
function layoutGraph(data: GraphData, width: number, height: number): PositionedGraph {
  const rawNodes = data.nodes ?? [];
  if (!rawNodes.length) {
    return { ...data, nodes: [] };
  }

  const w = Math.max(width, 320);
  const h = Math.max(height, 320);
  const minDimension = Math.min(w, h);
  const others = rawNodes.filter((node) => node.id !== 'me');

  const positions = new Map<string | number, { x: number; y: number }>();
  const baseRadius = Math.max(minDimension * 0.24, 120);
  const ringGap = Math.max(minDimension * 0.16, 90);

  let offset = 0;
  let ringIndex = 0;
  while (offset < others.length) {
    const capacity = Math.min(
      others.length - offset,
      Math.max(6, 8 + ringIndex * 6)
    );
    const radius = baseRadius + ringIndex * ringGap;

    for (let i = 0; i < capacity && offset + i < others.length; i += 1) {
      const node = others[offset + i];
      const angle = (2 * Math.PI * i) / capacity;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      positions.set(node.id, { x, y });
    }

    offset += capacity;
    ringIndex += 1;
  }

  return {
    ...data,
    nodes: rawNodes.map((node) => {
      if (node.id === 'me') {
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
      if (!nodeId || nodeId === 'me') return;
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
                const isRoot = node.id === 'me';
                const radius = isRoot ? 18 : 12;
                const color = isRoot ? '#38BDF8' : '#818CF8';
                const halo = isRoot ? '#0EA5E9' : '#312E81';

                ctx.save();
                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, radius + 3, 0, 2 * Math.PI, false);
                ctx.fillStyle = halo;
                ctx.globalAlpha = 0.35;
                ctx.fill();
                ctx.globalAlpha = 1;

                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = color;
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
