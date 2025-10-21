import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Layout from '../../components/Layout';
import { buildGraphData, loadContacts } from '../../lib/storage';
import { useRouter } from 'next/router';
import type { ForceGraphMethods } from 'react-force-graph-2d';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const buildAnchoredGraphData = (containerWidth = 1000, containerHeight = 1000) => {
  const data = buildGraphData('me', loadContacts());
  const contacts = data.nodes.filter((node: any) => node.id !== 'me');
  const contactsCount = contacts.length || 1;
  
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;
  
  // Calculate radius based on container size
  const baseRadius = Math.min(containerWidth, containerHeight) * 0.15; // 15% of smallest dimension
  const step = Math.min(containerWidth, containerHeight) * 0.03; // 3% of smallest dimension
  const maxRadius = Math.min(containerWidth, containerHeight) * 0.3; // 30% of smallest dimension
  const radius = Math.min(maxRadius, baseRadius + (contactsCount - 1) * step);
  const contactPositions = new Map<string, { x: number; y: number }>();

  contacts.forEach((node: any, index: number) => {
    const angle = (2 * Math.PI * index) / contactsCount;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    contactPositions.set(node.id, { x, y });
  });

  return {
    ...data,
    nodes: data.nodes.map((node: any) => {
      // Position the main node at the center
      if (node.id === 'me') {
        return {
          ...node,
          x: centerX,
          y: centerY,
          fx: centerX,
          fy: centerY
        };
      }
      // Position contact nodes in a circle around the center
      if (node.id === 'me') {
        return { ...node, fx: 0, fy: 0, x: 0, y: 0 };
      }

      const { x, y } = contactPositions.get(node.id) ?? { x: radius, y: 0 };
      return { ...node, fx: x, fy: y, x, y };
    })
  };
};

export default function GraphPage() {
  const router = useRouter();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [graphData, setGraphData] = useState(buildAnchoredGraphData);
  const fgRef = useRef<ForceGraphMethods | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update dimensions when container size changes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const centerGraph = useCallback(() => {
    if (!fgRef.current || !dimensions.width || !dimensions.height) return;
    try {
      const graphApi = fgRef.current as any;
      if (typeof graphApi.centerAt === 'function') {
        graphApi.centerAt(dimensions.width / 2, dimensions.height / 2, 400);
      }
    } catch (err) {
      console.warn('Не удалось центрировать граф:', err);
    }
  }, [dimensions]);

  useEffect(() => {
    const handleStorage = () => {
      setGraphData(buildAnchoredGraphData(dimensions.width, dimensions.height));
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, [dimensions]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      centerGraph();
    }, 600);
    return () => clearTimeout(timeout);
  }, [graphData, centerGraph]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', centerGraph);
    return () => {
      window.removeEventListener('resize', centerGraph);
    };
  }, [centerGraph]);

  const handleNodeClick = (node: any) => {
    if (node.id === 'me') return;
    router.push(`/app/contacts/${node.id}`);
  };

  return (
    <Layout>
      <div className="px-4 py-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Моя сеть</h1>
        <div 
          ref={containerRef}
          className="bg-gray-800 rounded-xl shadow overflow-hidden graph-container" 
          style={{ height: '500px' }}
        >
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel={(node: any) => node.name}
            nodeAutoColorBy="id"
            linkColor={() => '#334155'}
            linkWidth={1}
            onNodeClick={handleNodeClick}
            cooldownTicks={100}
            width={dimensions.width || 1000}
            height={dimensions.height || 500}
            onEngineStop={centerGraph}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.name;
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const padding = 2;

              ctx.beginPath();
              ctx.arc(node.x!, node.y!, 10, 0, 2 * Math.PI, false);
              ctx.fillStyle = node.id === 'me' ? '#0D9488' : '#475569';
              ctx.fill();

              ctx.fillStyle = 'rgba(15,23,42,0.8)';
              ctx.fillRect(node.x! - textWidth / 2 - padding, node.y! + 12, textWidth + padding * 2, fontSize + padding * 2);

              ctx.fillStyle = '#F8FAFC';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(label, node.x!, node.y! + 12 + padding);
            }}
          />
        </div>
      </div>
    </Layout>
  );
}
