import { FileDown } from 'lucide-react';
import { LabStage } from '../types/statistics';

interface TopBarProps {
  activeStage: LabStage;
  onSelectStage: (stage: LabStage) => void;
  onDownloadPdf: () => void;
  isExporting: boolean;
}

const NAV_ITEMS: { id: LabStage; label: string }[] = [
  { id: 'data', label: 'Raw Data' },
  { id: 'table', label: 'Frequency Table' },
  { id: 'histogram', label: 'Histogram' },
];

export function TopBar({
  activeStage,
  onSelectStage,
  onDownloadPdf,
  isExporting,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#14294A]/95 backdrop-blur border-b border-[#34598F]">
      <div className="max-w-[1360px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectStage('data');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
        >
          IGCSE 0580 Stats Lab
        </a>

        <nav
          aria-label="Statistics workflow stages"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeStage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectStage(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-blue-100/85 hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-3.5 h-0.5 bg-[#60A5FA]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#14294A] bg-white rounded-lg hover:bg-[#E0ECFF] active:bg-[#CFE0FF] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14294A]"
          >
            <FileDown className="w-4 h-4" aria-hidden="true" />
            <span>{isExporting ? 'Preparing PDF...' : 'Download PDF'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
