import { useEffect, useState } from 'react';
import { getAirlinesList } from '../../api';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// ── Airline dropdown (lists airlines registered on the admin side, with logo) ──
export function AirlineLogo({ logoUrl, name }) {
  return (
    <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 align-middle">
      {logoUrl
        ? <img src={logoUrl} alt="" className="w-full h-full object-contain bg-white" />
        : <span className="text-[9px] font-bold text-slate-600">{(name || '?').trim().charAt(0).toUpperCase()}</span>}
    </span>
  );
}

export function AirlineSelect({ value, onChange }) {
  const [airlines, setAirlines] = useState([]);
  useEffect(() => {
    getAirlinesList()
      .then(res => {
        // one entry per airline name (accounts can share a name); keep a logo if any has one
        const byName = new Map();
        (res.data || []).forEach(a => {
          if (!a.airlineName) return;
          const cur = byName.get(a.airlineName);
          if (!cur || (!cur.logo_url && a.logo_url)) byName.set(a.airlineName, { airlineName: a.airlineName, logo_url: a.logo_url || null });
        });
        setAirlines([...byName.values()]);
      })
      .catch(() => {});
  }, []);
  // keep a pre-existing value (e.g. imported / typed earlier) selectable
  const options = value && !airlines.some(a => a.airlineName === value)
    ? [{ airlineName: value, logo_url: null }, ...airlines]
    : airlines;
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="text-xs font-semibold"><SelectValue placeholder="Select airline" /></SelectTrigger>
      <SelectContent>
        {options.map(a => (
          <SelectItem key={a.airlineName} value={a.airlineName}>
            <span className="flex items-center gap-2">
              <AirlineLogo logoUrl={a.logo_url} name={a.airlineName} />
              {a.airlineName}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
