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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 15 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } },
};

const TRAINING_BADGES = {
  FDI: { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'FDI' },
  FDR: { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'FDR' },
  FDA: { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'FDA' },
  FTL: { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'FTL' },
  NDG: { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'NDG' },
  HF:  { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'HF'  },
  GD:  { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'GD'  },
  TCD: { bg: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold', label: 'TCD' },
};

const themeStyles = {
  blue: {
    border: 'border-slate-100 hover:border-blue-200/60 hover:shadow-[0_8px_30px_rgba(59,130,246,0.04)]',
    iconBg: 'bg-blue-50 text-blue-600',
  },
  purple: {
    border: 'border-slate-100 hover:border-purple-200/60 hover:shadow-[0_8px_30px_rgba(147,51,234,0.04)]',
    iconBg: 'bg-purple-50 text-purple-600',
  },
  emerald: {
    border: 'border-slate-100 hover:border-emerald-200/60 hover:shadow-[0_8px_30px_rgba(16,185,129,0.04)]',
    iconBg: 'bg-emerald-50 text-emerald-600',
  },
  amber: {
    border: 'border-slate-100 hover:border-amber-200/60 hover:shadow-[0_8px_30px_rgba(245,158,11,0.04)]',
    iconBg: 'bg-amber-50 text-amber-600',
  },
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
        { label: 'Total Records',      icon: HiOutlineUsers,        theme: 'blue', key: 'total' },
        { label: 'Training Types',     icon: HiOutlineAcademicCap,  theme: 'purple',  key: 'types' },
        { label: 'Certificates Ready', icon: HiOutlineDocumentText, theme: 'emerald', key: 'ready' },
        { label: 'This Month',         icon: HiOutlineCalendar,     theme: 'amber',  key: 'month' },
      ]
    : [
        { label: 'My Submissions',  icon: HiOutlineUsers,       theme: 'blue', key: 'total' },
        { label: 'Training Types',  icon: HiOutlineAcademicCap, theme: 'purple',  key: 'types' },
        { label: 'This Month',      icon: HiOutlineCalendar,    theme: 'amber',  key: 'month' },
      ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="p-4 sm:p-6 space-y-6">

      {/* Welcome & Greeting */}
      <motion.div variants={item} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
            {isAdmin ? 'Welcome back' : `Welcome, ${admin?.airlineName || admin?.name || 'Airline'}`}
          </h1>
          <p className="text-sm text-slate-500 font-normal mt-1">
            {isAdmin
              ? 'Manage training records and generate certificates'
              : 'Submit and track your training enrollment records'}
          </p>
        </div>
        <Link 
          to={isAdmin ? '/admin/participants/add' : '/airline/enrollment/new'} 
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all duration-200 font-semibold text-sm shadow-sm whitespace-nowrap flex-shrink-0"
        >
          <HiOutlinePlusCircle className="w-5 h-5" />
          {isAdmin ? 'New Record' : 'New Enrollment'}
        </Link>
      </motion.div>

      {/* Airline Notice Banner */}
      {!isAdmin && (
        <motion.div 
          variants={item} 
          className="flex items-start gap-4 p-5 rounded-2xl border border-blue-100/80 bg-gradient-to-r from-blue-50/40 to-indigo-50/10 backdrop-blur-sm shadow-[0_4px_20px_rgba(59,130,246,0.02)]"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/70 flex items-center justify-center flex-shrink-0 shadow-sm">
            <HiOutlineLockClosed className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Submissions are locked after filing</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Once you submit an enrollment, the record is locked. Only <span className="font-semibold text-slate-700">IFOA administrators</span> can edit records or generate certificates.
            </p>
          </div>
        </motion.div>
      )}

      {/* Stats Cards Grid */}
      <motion.div variants={item} className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        {statCards.map((card) => {
          const style = themeStyles[card.theme];
          return (
            <div 
              key={card.key} 
              className={`bg-white rounded-2xl border ${style.border} p-5 transition-all duration-300 hover:-translate-y-1 shadow-sm flex items-center justify-between group`}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">{card.label}</p>
                <p className="text-3xl font-extrabold text-slate-800 mt-2 tracking-tight group-hover:text-slate-950 transition-colors">
                  {stats[card.key]}
                </p>
              </div>
              <div className={`${style.iconBg} w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
                <card.icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Quick Actions + Recent Records */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

        {/* Quick Actions Card */}
        <motion.div variants={item} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col h-full">
          <h2 className="text-base font-bold text-slate-800 mb-5">Quick Actions</h2>
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            <Link
              to={isAdmin ? '/admin/participants/add' : '/airline/enrollment/new'}
              className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-blue-100 hover:bg-blue-50/20 transition-all duration-300 group shadow-sm hover:shadow-md"
            >
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center transition-colors group-hover:bg-blue-100/50 flex-shrink-0">
                <HiOutlinePlusCircle className="w-5.5 h-5.5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-700 transition-colors">
                  {isAdmin ? 'Add Participant' : 'New Enrollment'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {isAdmin ? 'Create a new training record' : 'Submit a new training enrollment'}
                </p>
              </div>
              <HiOutlineArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-all duration-300 transform group-hover:translate-x-1 flex-shrink-0" />
            </Link>

            {isAdmin && (
              <Link
                to="/admin/airlines?pendingCerts=1"
                className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-emerald-100 hover:bg-emerald-50/20 transition-all duration-300 group shadow-sm hover:shadow-md"
              >
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center transition-colors group-hover:bg-emerald-100/50 flex-shrink-0">
                  <HiOutlineDocumentText className="w-5.5 h-5.5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 group-hover:text-emerald-700 transition-colors">Generate Certificates</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">Download or print certificates</p>
                </div>
                <HiOutlineArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-all duration-300 transform group-hover:translate-x-1 flex-shrink-0" />
              </Link>
            )}

            <Link
              to={isAdmin ? '/admin/airlines' : '/airline/submissions'}
              className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-purple-100 hover:bg-purple-50/20 transition-all duration-300 group shadow-sm hover:shadow-md"
            >
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center transition-colors group-hover:bg-purple-100/50 flex-shrink-0">
                <HiOutlineUsers className="w-5.5 h-5.5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 group-hover:text-purple-700 transition-colors">
                  {isAdmin ? 'View Airlines' : 'My Submissions'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {isAdmin ? 'Browse all airline submissions' : 'View your submitted enrollments'}
                </p>
              </div>
              <HiOutlineArrowRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 transition-all duration-300 transform group-hover:translate-x-1 flex-shrink-0" />
            </Link>
          </div>
        </motion.div>

        {/* Recent Records Card */}
        <motion.div variants={item} className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6 lg:col-span-2 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-slate-800">
              {isAdmin ? 'Recent Records' : 'My Recent Submissions'}
            </h2>
            <Link 
              to={isAdmin ? '/admin/participants' : '/airline/submissions'} 
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-all duration-200 flex items-center gap-1 group/link"
            >
              View All
              <HiOutlineArrowRight className="w-3.5 h-3.5 transform group-hover/link:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <div className="overflow-x-auto -mx-1 flex-1">
            <Table className="min-w-[450px]">
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Airline</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRecords.map((record) => {
                  const badge = TRAINING_BADGES[record.training_type] || { bg: 'bg-slate-50 text-slate-600 border-slate-100', label: record.training_type };

                  const nameInitials = record.participant_name
                    ? record.participant_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                    : 'P';

                  return (
                    <TableRow key={record.id} className="group">
                      <TableCell className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                          {nameInitials}
                        </div>
                        <span className="text-sm font-semibold text-slate-700 truncate max-w-[150px]">{record.participant_name}</span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 hidden sm:table-cell max-w-[120px] truncate">{record.company}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg} whitespace-nowrap shadow-sm`}>
                          {badge.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400 font-medium whitespace-nowrap">
                        {new Date(record.training_date).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recentRecords.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-12 text-center text-sm text-slate-400 font-medium">
                      {isAdmin ? 'No records found. Add your first participant.' : 'No submissions yet. Start by adding a new enrollment.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
