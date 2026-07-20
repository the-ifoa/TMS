import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HiOutlineUsers,
  HiOutlineDocumentText,
  HiOutlineAcademicCap,
  HiOutlineCalendar,
  HiOutlineArrowRight,
  HiOutlinePlusCircle,
  HiOutlineLockClosed,
} from 'react-icons/hi';
import { getParticipants } from '../api';
import { useAuth } from '../context/AuthContext';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0 },
};

const TRAINING_LABELS = {
  FDI: 'FDI – Flight Dispatch Initial',
  FDR: 'FDR – Flight Dispatch Recurrent',
  FDA: 'FDA – Flight Dispatch Advanced',
  FTL: 'FTL – Flight Time Limitations',
  NDG: 'NDG – Dangerous Goods No-Carry',
  HF:  'HF – Human Factors for OCC',
  GD:  'GD – Ground Operations',
  TCD: 'TCD – Training Competencies Development',
};

export default function Dashboard() {
  const { admin, isAdmin } = useAuth();
  const [stats, setStats]             = useState({ total: 0, types: 0, ready: 0, month: 0 });
  const [recentRecords, setRecentRecords] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const res  = await getParticipants();
        const data = res.data;
        const types = new Set(data.map((p) => p.training_type));
        const now   = new Date();
        const thisMonth = data.filter((p) => {
          const d = new Date(p.training_date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        setStats({ total: data.length, types: types.size, ready: data.length, month: thisMonth.length });
        setRecentRecords(data.slice(0, 5));
      } catch { /* silent */ }
    }
    fetchData();
  }, []);

  const statCards = isAdmin
    ? [
        { label: 'Total Records',      icon: HiOutlineUsers,        color: 'bg-primary-800', key: 'total' },
        { label: 'Training Types',     icon: HiOutlineAcademicCap,  color: 'bg-accent-600',  key: 'types' },
        { label: 'Certificates Ready', icon: HiOutlineDocumentText, color: 'bg-emerald-600', key: 'ready' },
        { label: 'This Month',         icon: HiOutlineCalendar,     color: 'bg-violet-600',  key: 'month' },
      ]
    : [
        { label: 'My Submissions',  icon: HiOutlineUsers,       color: 'bg-primary-800', key: 'total' },
        { label: 'Training Types',  icon: HiOutlineAcademicCap, color: 'bg-accent-600',  key: 'types' },
        { label: 'This Month',      icon: HiOutlineCalendar,    color: 'bg-violet-600',  key: 'month' },
      ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">

      {/* Welcome */}
      <motion.div variants={item} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-800">
            {isAdmin ? 'Welcome back' : `Welcome, ${admin?.airlineName || admin?.name || 'Airline'}`}
          </h1>
          <p className="text-sm text-primary-400 mt-1">
            {isAdmin
              ? 'Manage training records and generate certificates'
              : 'Submit and track your training enrollment records'}
          </p>
        </div>
        <Link to={isAdmin ? '/admin/participants/add' : '/airline/enrollment/new'} className="btn-primary flex items-center gap-2">
          <HiOutlinePlusCircle className="w-4 h-4" />
          {isAdmin ? 'New Record' : 'New Enrollment'}
        </Link>
      </motion.div>

      {/* Airline notice */}
      {!isAdmin && (
        <motion.div variants={item} className="flex items-start gap-3 p-4 rounded-xl border" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <HiOutlineLockClosed className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#0000ff' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#000021' }}>Submissions are locked after filing</p>
            <p className="text-xs mt-0.5" style={{ color: '#3b4f9e' }}>
              Once you submit an enrollment, the record is locked. Only IFOA administrators can edit records or generate certificates.
            </p>
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={item} className={`grid grid-cols-2 ${isAdmin ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3 sm:gap-4`}>
        {statCards.map((card) => (
          <div key={card.key} className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-primary-400 uppercase tracking-wider leading-tight">{card.label}</p>
                <p className="text-2xl sm:text-3xl font-bold text-primary-800 mt-1 sm:mt-2">{stats[card.key]}</p>
              </div>
              <div className={`${card.color} w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0`}>
                <card.icon className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Quick Actions + Recent Records */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Quick Actions */}
        <motion.div variants={item} className="card p-6">
          <h2 className="text-base font-bold text-primary-800 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to={isAdmin ? '/admin/participants/add' : '/airline/enrollment/new'}
              className="flex items-center gap-3 p-3 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors group"
            >
              <div className="w-9 h-9 bg-accent-50 rounded-lg flex items-center justify-center">
                <HiOutlinePlusCircle className="w-5 h-5 text-accent-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-primary-700">
                  {isAdmin ? 'Add Participant' : 'New Enrollment'}
                </p>
                <p className="text-xs text-primary-400">
                  {isAdmin ? 'Create a new training record' : 'Submit a new training enrollment'}
                </p>
              </div>
              <HiOutlineArrowRight className="w-4 h-4 text-primary-300 group-hover:text-primary-500 transition-colors" />
            </Link>

            {isAdmin && (
              <Link
                to="/admin/certificates"
                className="flex items-center gap-3 p-3 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors group"
              >
                <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <HiOutlineDocumentText className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary-700">Generate Certificates</p>
                  <p className="text-xs text-primary-400">Download or print certificates</p>
                </div>
                <HiOutlineArrowRight className="w-4 h-4 text-primary-300 group-hover:text-primary-500 transition-colors" />
              </Link>
            )}

            <Link
              to={isAdmin ? '/admin/airlines' : '/airline/submissions'}
              className="flex items-center gap-3 p-3 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors group"
            >
              <div className="w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center">
                <HiOutlineUsers className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-primary-700">
                  {isAdmin ? 'View Airlines' : 'My Submissions'}
                </p>
                <p className="text-xs text-primary-400">
                  {isAdmin ? 'Browse all airline submissions' : 'View your submitted enrollments'}
                </p>
              </div>
              <HiOutlineArrowRight className="w-4 h-4 text-primary-300 group-hover:text-primary-500 transition-colors" />
            </Link>
          </div>
        </motion.div>

        {/* Recent Records */}
        <motion.div variants={item} className="card p-4 sm:p-6 lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-primary-800">
              {isAdmin ? 'Recent Records' : 'My Recent Submissions'}
            </h2>
            <Link to={isAdmin ? '/admin/participants' : '/airline/submissions'} className="text-xs font-medium text-accent-600 hover:text-accent-700">
              View All
            </Link>
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-primary-200">
                  <th className="text-left text-[10px] font-semibold text-primary-400 uppercase tracking-wider pb-3 pr-3">Name</th>
                  <th className="text-left text-[10px] font-semibold text-primary-400 uppercase tracking-wider pb-3 pr-3 hidden sm:table-cell">Airline</th>
                  <th className="text-left text-[10px] font-semibold text-primary-400 uppercase tracking-wider pb-3 pr-3">Training</th>
                  <th className="text-left text-[10px] font-semibold text-primary-400 uppercase tracking-wider pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((record) => (
                  <tr key={record.id} className="border-b border-primary-100 last:border-0">
                    <td className="py-3 pr-3 text-sm font-medium text-primary-800 max-w-[120px] truncate">{record.participant_name}</td>
                    <td className="py-3 pr-3 text-sm text-primary-500 hidden sm:table-cell max-w-[100px] truncate">{record.company}</td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 whitespace-nowrap">
                        {record.training_type}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-primary-400 whitespace-nowrap">
                      {new Date(record.training_date).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
                {recentRecords.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-primary-400">
                      {isAdmin ? 'No records found. Add your first participant.' : 'No submissions yet. Start by adding a new enrollment.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
