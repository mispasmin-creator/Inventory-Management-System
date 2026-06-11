import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';

const Login = () => {
  const { login } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      username: '',
      password: ''
    }
  });

  const onSubmit = async (data) => {
    setLoading(true);
    const res = await login(data.username, data.password);
    setLoading(false);
    if (res.success) {
      showSuccess('Welcome back! Login successful.');
      navigate('/');
    } else {
      showError(res.message || 'Invalid username or password.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-[#070b13]">
      {/* Dynamic Backdrops */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-violet-600/10 blur-[100px] pointer-events-none" />

      {/* Main Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 25, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 180 }}
        className="w-full max-w-[430px] rounded-2xl glass-card-glow border border-indigo-500/15 p-8 relative z-10"
      >
        {/* Brand Identity */}
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="PMMPL Logo" 
            className="w-14 h-14 rounded-2xl mx-auto object-cover shadow-xl shadow-indigo-500/20 mb-3 border border-indigo-400/20" 
          />
          <h2 className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            PMMPL IMS Portal
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Inventory & Branch Operations Management System
          </p>
        </div>

        {/* Form container */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Username Field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-1">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Enter username"
                {...register('username', { required: 'Username is required' })}
                className={`w-full pl-10 pr-4 py-3 text-sm rounded-xl glass-input ${
                  errors.username ? 'border-rose-500/40 focus:border-rose-500/60 focus:ring-rose-500/20' : ''
                }`}
              />
            </div>
            {errors.username && (
              <span className="text-[10px] text-rose-400 pl-1 flex items-center gap-1 font-medium mt-1">
                <ShieldAlert className="w-3 h-3" />
                {errors.username.message}
              </span>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...register('password', { required: 'Password is required' })}
                className={`w-full pl-10 pr-11 py-3 text-sm rounded-xl glass-input ${
                  errors.password ? 'border-rose-500/40 focus:border-rose-500/60 focus:ring-rose-500/20' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 focus:outline-none transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <span className="text-[10px] text-rose-400 pl-1 flex items-center gap-1 font-medium mt-1">
                <ShieldAlert className="w-3 h-3" />
                {errors.password.message}
              </span>
            )}
          </div>

          {/* Form Actions */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 border border-indigo-400/20 cursor-pointer"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Authenticating User...</span>
              </div>
            ) : (
              'Sign In to Dashboard'
            )}
          </button>
        </form>

        {/* Footer info / Credentials Helper */}
        {/* <div className="mt-8 pt-5 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 leading-normal">
            Demo Users: Admin: <code className="text-slate-400 font-mono">admin / 123</code> | Branch: <code className="text-slate-400 font-mono">manager_main / 123</code>
          </p>
        </div> */}
      </motion.div>
    </div>
  );
};

export default Login;
