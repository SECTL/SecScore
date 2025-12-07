import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Student {
  id: number;
  name: string;
  class: string;
  total_points: number;
}



const PointOperation: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<number | ''>('');
  const [pointAction, setPointAction] = useState<'add' | 'subtract'>('add');
  const [points, setPoints] = useState<string>('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // 常用理由选项
  const reasonOptions = [
    '作业完成优秀',
    '课堂表现积极',
    '考试成绩优异',
    '乐于助人',
    '遵守纪律',
    '其他'
  ];

  // 获取学生列表
  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const result = await invoke('get_students');
      setStudents(result as Student[]);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 处理表单提交，直接执行积分操作
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStudent || !points || (!reason && !customReason)) {
      return;
    }
    
    setIsSubmitting(true);
    setSuccessMessage('');
    
    try {
      const pointsValue = parseInt(points);
      const finalPoints = pointAction === 'add' ? pointsValue : -pointsValue;
      const finalReason = reason === '其他' ? customReason : reason;
      
      await invoke('add_point_record', {
        studentId: parseInt(selectedStudent.toString()),
        points: finalPoints,
        reason: finalReason,
        operator: 'admin' // 实际应该从登录用户获取
      });
      
      // 重置表单
      setSelectedStudent('');
      setPointAction('add');
      setPoints('');
      setReason('');
      setCustomReason('');
      
      // 刷新学生列表
      fetchStudents();
      
      // 显示成功消息
      setSuccessMessage('积分操作成功！');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Failed to add point record:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">积分操作</h2>
        <p className="text-gray-600 mt-1">为学生添加或扣除积分</p>
      </div>

      {/* 成功消息 */}
      {successMessage && (
        <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-md">
          {successMessage}
        </div>
      )}

      {/* 积分操作表单 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 学生选择 */}
            <div>
              <label htmlFor="student" className="form-label">选择学生</label>
              <select
                id="student"
                className="form-input"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value as any)}
                disabled={isLoading}
              >
                <option value="">请选择学生</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} - {student.class} (当前积分: {student.total_points})
                  </option>
                ))}
              </select>
            </div>

            {/* 积分操作类型 */}
            <div>
              <label className="form-label">操作类型</label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="pointAction"
                    value="add"
                    checked={pointAction === 'add'}
                    onChange={() => setPointAction('add')}
                    className="text-primary"
                  />
                  <span className="text-sm text-gray-700">加分</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="pointAction"
                    value="subtract"
                    checked={pointAction === 'subtract'}
                    onChange={() => setPointAction('subtract')}
                    className="text-primary"
                  />
                  <span className="text-sm text-gray-700">扣分</span>
                </label>
              </div>
            </div>

            {/* 分数输入 */}
            <div>
              <label htmlFor="points" className="form-label">
                {pointAction === 'add' ? '加分' : '扣分'}数量 (1-100)
              </label>
              <input
                type="number"
                id="points"
                className="form-input"
                placeholder="请输入分数"
                value={points}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 100)) {
                    setPoints(value);
                  }
                }}
                min="1"
                max="100"
              />
            </div>

            {/* 理由选择 */}
            <div>
              <label htmlFor="reason" className="form-label">操作理由</label>
              <select
                id="reason"
                className="form-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">请选择理由</option>
                {reasonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 自定义理由 */}
          {reason === '其他' && (
            <div>
              <label htmlFor="customReason" className="form-label">自定义理由</label>
              <textarea
                id="customReason"
                className="form-input"
                placeholder="请输入自定义理由"
                rows={3}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>
          )}

          {/* 提交按钮 */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="btn btn-primary px-6 py-2"
              disabled={isSubmitting || !selectedStudent || !points || (!reason && !customReason)}
            >
              {isSubmitting ? '提交中...' : '提交'}
            </button>
          </div>
        </form>
      </div>

      {/* 最近操作记录 */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">最近操作记录</h3>
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="h-40 flex items-center justify-center text-gray-500">
            最近操作记录将显示在这里
          </div>
        </div>
      </div>
    </div>
  );
};

export default PointOperation;