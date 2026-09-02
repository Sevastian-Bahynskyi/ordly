import type { LucideIcon } from 'lucide-react'

export function StatCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string | number; detail?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-icon"><Icon size={18} /></span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  )
}
