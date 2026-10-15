import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBack } from '@/hooks/use-history-state';
import toast from 'react-hot-toast';
import { getExam, getExamAttempt, saveExamAnswers, checkExamAnswer, submitExamAttempt, reportExamViolation } from '../api';
import ExamRunner from '../components/ExamRunner';
import { Skeleton } from '@/components/ui/skeleton';

// Airline-driven exam taking. Loads the attempt + exam, then hands off to the
// shared ExamRunner (same UI + anti-cheat used by the public emailed-link flow).
export default function ExamTake() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const goBack = useBack('/airline/exams');
  const [attempt, setAttempt] = useState(null);
  const [exam, setExam] = useState(null);

  useEffect(() => {
    Promise.all([getExamAttempt(attemptId), getExam(examId)])
      .then(([attRes, examRes]) => {
        const att = attRes.data;
        if (att.status !== 'in_progress') {
          navigate(`/airline/exams/${examId}/result/${attemptId}`, { replace: true });
          return;
        }
        setAttempt(att);
        setExam(examRes.data);
      })
      .catch(() => toast.error('Failed to load exam.'));
  }, [attemptId, examId, navigate]);

  if (!attempt || !exam) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 pb-10 p-6">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <ExamRunner
      attempt={attempt}
      exam={exam}
      onSaveAnswers={(payload, opts) => saveExamAnswers(attemptId, payload, opts)}
      onCheckAnswer={(qId, response) => checkExamAnswer(attemptId, qId, response).then((r) => r.data)}
      onSubmit={() => submitExamAttempt(attemptId)}
      onReportViolation={(type) => reportExamViolation(attemptId, type).then((r) => r.data)}
      onFinished={() => navigate(`/airline/exams/${examId}/result/${attemptId}`, { replace: true })}
      onBack={() => goBack()}
    />
  );
}
