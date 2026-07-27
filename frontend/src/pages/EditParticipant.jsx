import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getParticipant, updateParticipant } from '../api';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const TRAINING_TYPES = [
  { value: 'FDI', label: 'FDI – Flight Dispatch Initial' },
  { value: 'FDR', label: 'FDR – Flight Dispatch Recurrent' },
  { value: 'FDA', label: 'FDA – Flight Dispatch Advanced' },
  { value: 'FTL', label: 'FTL – Flight Time Limitations' },
  { value: 'NDG', label: 'NDG – Dangerous Goods No-Carry' },
  { value: 'HF',  label: 'HF – Human Factors for OCC' },
  { value: 'GD',  label: 'GD – Ground Operations' },
  { value: 'TCD', label: 'TCD – Training Competencies Development' },
];

const ALL_MODULES = [
  'Air Law', 'Aircraft Systems', 'Navigation', 'Meteorology',
  'Flight Planning', 'Human Performance', 'Mass & Balance',
  'Operational Procedures', 'Communications', 'Flight Monitoring',
  'Aircraft Performance', 'Air Traffic Management', 'Principles of Flight',
];

export default function EditParticipant() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    company: '',
    department: '',
    training_type: '',
    training_date: '',
    end_date: '',
    location: '',
    modules: [],
    ndg_subtype: 'I',
    online_synchronous: false,
  });

  useEffect(() => {
    async function load() {
      try {
        const res  = await getParticipant(id);
        const data = res.data;

        let fName = data.first_name || '';
        let lName = data.last_name  || '';
        if (!fName && !lName && data.participant_name) {
          const parts = data.participant_name.trim().split(' ');
          fName = parts[0] || '';
          lName = parts.slice(1).join(' ') || '';
        }

        setForm({
          first_name:         fName,
          last_name:          lName,
          email:              data.email         || '',
          company:            data.company       || '',
          department:         data.department    || '',
          training_type:      data.training_type || '',
          training_date:      data.training_date ? data.training_date.slice(0, 10) : '',
          end_date:           data.end_date      ? data.end_date.slice(0, 10) : '',
          location:           data.location      || '',
          modules:            data.modules ? data.modules.split(',').map(m => m.trim()) : [],
          ndg_subtype:        data.ndg_subtype       || 'I',
          online_synchronous: data.online_synchronous || false,
        });
      } catch {
        toast.error('Failed to load record');
        navigate('/admin/airlines');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleModule = (mod) => {
    setForm(prev => ({
      ...prev,
      modules: prev.modules.includes(mod)
        ? prev.modules.filter(m => m !== mod)
        : [...prev.modules, mod],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('Please enter both first and last name');
      return;
    }
    try {
      setSaving(true);
      await updateParticipant(id, form);
      toast.success('Record updated');
      navigate('/admin/airlines');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="min-h-full">
      {/* ── Sticky Page Header Bar (Clean, balanced design) ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 shadow-2xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 shadow-2xs hover:bg-slate-50 transition-all flex-shrink-0"
              title="Go back"
            >
              <HiOutlineArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight whitespace-nowrap">Edit Participant</h1>
              <span className="hidden sm:inline text-xs text-slate-400 truncate">
                {form.first_name} {form.last_name}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">

        {/* First + Last name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">First Name *</label>
            <input name="first_name" value={form.first_name} onChange={handleChange}
              className="input-field" placeholder="First name" />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input name="last_name" value={form.last_name} onChange={handleChange}
              className="input-field" placeholder="Last name" />
          </div>
        </div>

        {/* Email — used to send the participant their exam link */}
        <div>
          <label className="label">Email <span className="text-primary-400 font-normal normal-case">(for exam invitations)</span></label>
          <input type="email" name="email" value={form.email} onChange={handleChange}
            className="input-field" placeholder="e.g. candidate@example.com" />
        </div>

        {/* Airline + Department */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Airline Name *</label>
            <input name="company" value={form.company} onChange={handleChange}
              className="input-field" placeholder="e.g. Emirates Airlines" />
          </div>
          <div>
            <label className="label">Department *</label>
            <input name="department" value={form.department} onChange={handleChange}
              className="input-field" />
          </div>
        </div>

        {/* Training Type */}
        <div>
          <label className="label">Type of Training *</label>
          <Select value={form.training_type || undefined} onValueChange={v => handleChange({ target: { name: 'training_type', value: v } })}>
            <SelectTrigger><SelectValue placeholder="Select training type" /></SelectTrigger>
            <SelectContent>
              {TRAINING_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* NDG subtype — Initial or Recurrent */}
        {form.training_type === 'NDG' && (
          <div>
            <label className="label">NDG Training Type *</label>
            <div className="flex gap-3">
              {[{ val: 'I', label: 'I — Initial' }, { val: 'R', label: 'R — Recurrent' }].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setForm(f => ({ ...f, ndg_subtype: opt.val }))}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    form.ndg_subtype === opt.val
                      ? 'border-accent-500 bg-accent-50 text-accent-700'
                      : 'border-primary-200 text-primary-500 hover:border-primary-400'
                  }`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    form.ndg_subtype === opt.val ? 'border-accent-500' : 'border-primary-300'
                  }`}>
                    {form.ndg_subtype === opt.val && <div className="w-2.5 h-2.5 rounded-full bg-accent-500" />}
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-primary-400 mt-1.5">Select whether this is an Initial or Recurrent DG No-Carry training</p>
          </div>
        )}

        {/* Start Date + End Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date *</label>
            <input type="date" name="training_date" value={form.training_date}
              onChange={handleChange} className="input-field" />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" name="end_date" value={form.end_date}
              onChange={handleChange} className="input-field"
              min={form.training_date || undefined} />
            <p className="text-[10px] text-primary-400 mt-1">Completion date shown on certificate</p>
          </div>
        </div>

        {/* Online Synchronous + Location */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button type="button"
              onClick={() => setForm(f => ({ ...f, online_synchronous: !f.online_synchronous, location: '' }))}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                form.online_synchronous ? 'bg-accent-600 border-accent-600' : 'border-primary-300 hover:border-primary-500'
              }`}>
              {form.online_synchronous && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className="text-sm font-medium text-primary-700">Online Synchronous</span>
            <span className="text-xs text-primary-400">(replaces location on certificate)</span>
          </div>
          {!form.online_synchronous && (
            <div>
              <label className="label">Training Location</label>
              <input name="location" value={form.location} onChange={handleChange}
                className="input-field" placeholder="e.g. Dubai, UAE" />
            </div>
          )}
          {form.online_synchronous && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent-200 bg-accent-50">
              <span className="text-xs text-accent-700 font-medium">Certificate will show: <strong>Online Synchronous</strong></span>
            </div>
          )}
        </div>

        {/* Modules for FDR */}
        {form.training_type === 'FDR' && (
          <div className="animate-fade-in">
            <label className="label">Training Modules</label>
            <p className="text-xs text-primary-400 mb-3">Select completed modules</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_MODULES.map(mod => (
                <button key={mod} type="button" onClick={() => toggleModule(mod)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                    form.modules.includes(mod)
                      ? 'border-accent-400 bg-accent-50 text-accent-700 font-medium'
                      : 'border-primary-200 text-primary-600 hover:border-primary-300'
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                    form.modules.includes(mod) ? 'bg-accent-500' : 'border border-primary-300'
                  }`}>
                    {form.modules.includes(mod) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {mod}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Admin notice */}
        <div className="flex items-start gap-2 p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <span className="text-primary-400 text-sm mt-0.5">ℹ</span>
          <p className="text-xs text-primary-500">
            As admin you are editing a locked record submitted by the airline. Changes are saved immediately.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-primary-200">
          <button type="button" onClick={() => navigate(-1)} className="btn-outline">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Update Record'}
          </button>
        </div>
      </form>
      </div>
    </motion.div>
  );
}
