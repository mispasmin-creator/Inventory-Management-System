import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

const Login = () => {
    const { login } = useAuth();
    const { showSuccess, showError } = useToast();
    const navigate = useNavigate();
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm({
        defaultValues: { username: '', password: '' }
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
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-green-50 via-white to-emerald-50 p-4">
            {/* Decorative blurred circles - dark green tones */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-green-200/40 blur-3xl" />
                <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
                <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/30 blur-3xl" />
            </div>

            {/* Main Card */}
            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative z-10 w-full max-w-[400px] rounded-3xl bg-white/80 p-8 shadow-2xl shadow-green-200/60 backdrop-blur-xl ring-1 ring-white/50"
            >
                {/* Brand Section */}
                <div className="mb-8 text-center">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                        className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-green-600 to-emerald-700 shadow-lg shadow-green-300/50"
                    >
                        <img
                            src="/logo.png"
                            alt="PMMPL Logo"
                            className="h-14 w-14 rounded-xl object-cover"
                        />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-slate-800">Passary IMS</h2>
                    <p className="mt-1 text-sm text-slate-500">Inventory Management System</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    {/* Username */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Username
                        </label>
                        <div className="relative group">
                            <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-green-700" />
                            <input
                                type="text"
                                placeholder="Enter your username"
                                {...register('username', { required: 'Username is required' })}
                                className={`w-full rounded-xl border border-slate-200 bg-white/60 py-3 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 transition-all duration-200 focus:border-green-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-300/60 ${
                                    errors.username ? 'border-red-300 focus:border-red-300 focus:ring-red-200/60' : ''
                                }`}
                            />
                        </div>
                        {errors.username && (
                            <motion.p
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-1.5 text-xs text-red-500"
                            >
                                {errors.username.message}
                            </motion.p>
                        )}
                    </div>

                    {/* Password */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Password
                        </label>
                        <div className="relative group">
                            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-green-700" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Enter your password"
                                {...register('password', { required: 'Password is required' })}
                                className={`w-full rounded-xl border border-slate-200 bg-white/60 py-3 pl-10 pr-12 text-sm text-slate-700 placeholder:text-slate-400 transition-all duration-200 focus:border-green-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-300/60 ${
                                    errors.password ? 'border-red-300 focus:border-red-300 focus:ring-red-200/60' : ''
                                }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.password && (
                            <motion.p
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-1.5 text-xs text-red-500"
                            >
                                {errors.password.message}
                            </motion.p>
                        )}
                    </div>

                    {/* Submit Button - Dark Green Gradient */}
                    <motion.button
                        type="submit"
                        disabled={loading}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative w-full overflow-hidden rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 ${
                            loading
                                ? 'cursor-not-allowed bg-green-500'
                                : 'cursor-pointer bg-gradient-to-r from-green-600 to-emerald-700 shadow-green-300/50 hover:shadow-green-400/60'
                        }`}
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                Signing in…
                            </span>
                        ) : (
                            <span className="flex items-center justify-center gap-2">
                                <LogIn className="h-4 w-4" />
                                Sign In
                            </span>
                        )}
                    </motion.button>
                </form>

                {/* Footer - minimal */}
                <div className="mt-6 border-t border-slate-200/80 pt-4 text-center">
                    <p className="text-[10px] text-slate-400">Secure access for authorized users</p>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;