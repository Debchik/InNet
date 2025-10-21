import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Layout from '../../components/Layout';
import { buildGraphData, loadContacts } from '../../lib/storage';
import { useRouter } from 'next/router';
import type { ForceGraphMethods } from 'react-force-graph-2d';

// ✅ Динамический импорт только 2D версии графа
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

/**
 * Страница визуализирует сеть контактов пользователя в виде графа.
 * Можно зумить, двигать и кликать по узлам, чтобы переходить к контактам.
 */
export default function GraphPage() {
  const router = useRouter();
  const [graphData, setGraphData] = useState(buildGraphData('me', loadContacts()));
  const fgRef = useRef<ForceGraphMethods>();

  // Обновляем граф при изменении localStorage
  useEffect(() => {
    const handleStorage = () => {
      setGraphData(buildGraphData('me', loadContacts()));
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, []);

  const handleNodeClick = (node: any) => {
    if (node.id === 'me') return;
    router.push(`/app/contacts/${node.id}`);
  };

  return (
    <Layout>
      <div className="px-4 py-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Моя сеть</h1>
        <div className="bg-gray-800 rounded-xl shadow overflow-hidden" style={{ height: '500px' }}>
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel={(node: any) => node.name}
            nodeAutoColorBy="id"
            linkColor={() => '#334155'}
            linkWidth={1}
            onNodeClick={handleNodeClick}
            cooldownTicks={100}
            onEngineStop={() => {
              // ✅ Корректный вызов zoomToFit() для ForceGraph2D
              fgRef.current?.zoomToFit(400, 50);
            }}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.name;
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const padding = 2;

              // Круг (узел)
              ctx.beginPath();
              ctx.arc(node.x!, node.y!, 10, 0, 2 * Math.PI, false);
              ctx.fillStyle = node.id === 'me' ? '#0D9488' : '#475569';
              ctx.fill();

              // Подложка под текст
              ctx.fillStyle = 'rgba(15,23,42,0.8)';
              ctx.fillRect(node.x! - textWidth / 2 - padding, node.y! + 12, textWidth + padding * 2, fontSize + padding * 2);

              // Подпись узла
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