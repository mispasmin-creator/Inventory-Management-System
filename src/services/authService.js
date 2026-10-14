// Authentication Service
import { supabase } from './supabaseClient';

export const authService = {
  login: async (username, password) => {
    try {
      const { data, error } = await supabase
        .from('login')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .is('deleted_at', null);

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        const loggedUser = data[0];

        // If role is Admin, don't restrict page_access and firm_name (allow all)
        if (loggedUser.role === 'Admin') {
          return {
            success: true,
            user: {
              username: loggedUser.username,
              name: loggedUser.username === 'admin' ? 'System Administrator' : loggedUser.username,
              role: loggedUser.role,
              branch: 'All', // Admin sees all branches
              page_access: null
            }
          };
        } else {
          // Parse firm_name: may be 'All', a single branch, or comma-separated list
          const rawFirm = loggedUser.firm_name || 'All';
          const branch = rawFirm === 'All' ? 'All' : rawFirm.split(',').map(s => s.trim()).filter(Boolean);
          return {
            success: true,
            user: {
              username: loggedUser.username,
              name: loggedUser.username,
              role: loggedUser.role,
              branch, // 'All' string OR array like ['Purab','Pmmpl']
              page_access: loggedUser.page_access || []
            }
          };
        }
      }

      return { success: false, message: 'Invalid username or password' };
    } catch (e) {
      console.error('Supabase authentication error:', e.message);
      return { success: false, message: e.message || 'Server connection error' };
    }
  }
};
