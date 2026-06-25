import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  HiOutlineUserCircle,
  HiOutlineMail,
  HiOutlineShieldCheck,
  HiOutlineClock,
  HiOutlinePencil,
  HiOutlineLockClosed,
  HiOutlinePhotograph,
  HiOutlineX,
  HiOutlineOfficeBuilding,
  HiOutlineCheckCircle,
  HiOutlineInformationCircle,
  HiOutlineLocationMarker,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { updateProfile, uploadAirlineLogo } from '../api';
import logoImg from '../assets/logo.png';

export default function Profile() {
  const { admin, updateAdmin, isAdmin } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(admin?.name || '');
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingAirlineName, setEditingAirlineName] = useState(false);
  const [airlineName, setAirlineName] = useState(admin?.airlineName || '');
  const [editingAddress, setEditingAddress] = useState(false);
  const [address, setAddress] = useState(admin?.address || '');

  // Keep local states in sync if the auth context admin object changes
  // Only update when NOT currently editing to avoid overwriting in-progress input
  useEffect(() => {
    if (!editingAirlineName && admin?.airlineName) setAirlineName(admin.airlineName);
    if (!editingName && admin?.name)              setName(admin.name);
    if (!editingAddress && admin?.address !== undefined) setAddress(admin.address || '');
  }, [admin]);

  const [logoFile, setLogoFile]           = useState(null);
  const [logoPreview, setLogoPreview]     = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  const handleLogoFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setUploadingLogo(true);
    try {
      const uploadRes = await uploadAirlineLogo(logoFile);
      const logo_url  = uploadRes.data.logo_url;
      const res = await updateProfile({ logo_url });
      updateAdmin(res.data.token, res.data.admin);
      toast.success('Company logo updated!');
      setLogoFile(null);
      setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const cancelLogoChange = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleNameSave = async () => {
    if (!name.trim()) return toast.error('Name cannot be empty');
    setSaving(true);
    try {
      const res = await updateProfile({ name: name.trim() });
      updateAdmin(res.data.token, res.data.admin);
      toast.success('Name updated successfully');
      setEditingName(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleAirlineNameSave = async () => {
    const nextName = airlineName.trim();
    if (!nextName) return toast.error('Airline name cannot be empty');
    setSaving(true);
    try {
      // Send both keys for compatibility with older backend handlers.
      const res = await updateProfile({ airlineName: nextName, organization: nextName });
      const savedName = res.data.admin?.airlineName || nextName;

      // Keep UI state and auth context aligned even if response omits airlineName.
      setAirlineName(savedName);
      updateAdmin(res.data.token, { ...admin, ...res.data.admin, airlineName: savedName });
      toast.success('Airline name updated successfully');
      setEditingAirlineName(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update airline name');
    } finally {
      setSaving(false);
    }
  };

  const handleAddressSave = async () => {
    const nextAddress = address.trim();
    setSaving(true);
    try {
      const res = await updateProfile({ address: nextAddress });
      const savedAddress = res.data.admin?.address ?? nextAddress;
      setAddress(savedAddress);
      updateAdmin(res.data.token, { ...admin, ...res.data.admin, address: savedAddress });
      toast.success('Address updated successfully');
      setEditingAddress(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update address');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!currentPassword) return toast.error('Enter your current password');
    if (newPassword.length < 6) return toast.error('New password must be at least 6 characters');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      const res = await updateProfile({ currentPassword, newPassword });
      updateAdmin(res.data.token, res.data.admin);
      toast.success('Password changed successfully');
      setChangingPassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleEmailSave = async () => {
    if (!emailPassword) return toast.error('Enter your current password');
    if (!newEmail.trim()) return toast.error('Enter the new email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) return toast.error('Please enter a valid email');
    setSaving(true);
    try {
      const res = await updateProfile({ currentPassword: emailPassword, newEmail: newEmail.trim() });
      updateAdmin(res.data.token, res.data.admin);
      toast.success('Email updated successfully');
      setChangingEmail(false);
      setEmailPassword(''); setNewEmail('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change email');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto space-y-4 sm:space-y-6 px-0">

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-primary-800">Profile</h1>
        <p className="text-sm text-primary-400 mt-1">Manage your account details</p>
      </div>

      {/* Profile card */}
      <div className="card p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border border-primary-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            {!isAdmin && admin?.logo_url
              ? <img src={admin.logo_url} alt={admin.airlineName} className="w-full h-full object-contain p-1" />
              : <img src={logoImg} alt="IFOA" className="w-12 h-12 sm:w-16 sm:h-16 object-contain" />
            }
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="border border-primary-200 rounded-lg px-3 py-1.5 text-sm text-primary-800 focus:outline-none focus:ring-2 focus:ring-accent-400 w-full sm:w-auto min-w-0 sm:min-w-[180px]"
                  autoFocus />
                <div className="flex gap-2">
                  <button onClick={handleNameSave} disabled={saving}
                    className="px-3 py-1.5 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingName(false); setName(admin?.name || ''); }}
                    className="px-3 py-1.5 bg-primary-100 text-primary-600 text-xs font-medium rounded-lg hover:bg-primary-200">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-primary-800 truncate">{admin?.name || 'Admin User'}</h2>
                <button onClick={() => setEditingName(true)}
                  className="p-1 text-primary-400 hover:text-primary-600 rounded-lg hover:bg-primary-100 flex-shrink-0">
                  <HiOutlinePencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-sm text-primary-400 mt-0.5">{admin?.role || 'Administrator'}</p>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <HiOutlineMail className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary-400 uppercase tracking-wider">Email</p>
              <p className="text-sm font-medium text-primary-800 truncate">{admin?.email || 'admin@ifoa.com'}</p>
            </div>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <HiOutlineShieldCheck className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary-400 uppercase tracking-wider">Role</p>
              <p className="text-sm font-medium text-primary-800">{admin?.role || 'Administrator'}</p>
            </div>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <HiOutlineUserCircle className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary-400 uppercase tracking-wider">Organization</p>
              {!isAdmin && editingAirlineName ? (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={airlineName}
                    onChange={(e) => setAirlineName(e.target.value)}
                    className="border border-primary-200 rounded-lg px-3 py-1.5 text-sm text-primary-800 focus:outline-none focus:ring-2 focus:ring-accent-400 w-full sm:w-auto min-w-0 sm:min-w-[200px]"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAirlineNameSave} disabled={saving}
                      className="px-3 py-1.5 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingAirlineName(false); setAirlineName(admin?.airlineName || ''); }}
                      className="px-3 py-1.5 bg-primary-100 text-primary-600 text-xs font-medium rounded-lg hover:bg-primary-200">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-primary-800 truncate">
                    {isAdmin
                      ? (admin?.organization || 'IFOA - International Flight Operations Academy')
                      : (admin?.airlineName || admin?.name || 'Airline')}
                  </p>
                  {!isAdmin && (
                    <button onClick={() => { setEditingAirlineName(true); setAirlineName(admin?.airlineName || ''); }}
                      className="p-1 text-primary-400 hover:text-primary-600 rounded-lg hover:bg-primary-100 flex-shrink-0">
                      <HiOutlinePencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <HiOutlineClock className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary-400 uppercase tracking-wider">Last Login</p>
              <p className="text-sm font-medium text-primary-800">
                {new Date(admin?.lastLogin || Date.now()).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Address — airline only */}
      {!isAdmin && (
        <div className="card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                <HiOutlineLocationMarker className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-primary-800">Airline Address</h3>
                <p className="text-xs text-primary-400 mt-0.5">Mailing address for your airline</p>
              </div>
            </div>
            {!editingAddress && (
              <button onClick={() => { setEditingAddress(true); setAddress(admin?.address || ''); }}
                className="px-3 sm:px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap">
                {admin?.address ? 'Edit Address' : 'Add Address'}
              </button>
            )}
          </div>
          {editingAddress ? (
            <div className="space-y-3">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder="Enter the airline's full address"
                className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm text-primary-800 focus:outline-none focus:ring-2 focus:ring-accent-400 resize-y"
                autoFocus
              />
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <button onClick={handleAddressSave} disabled={saving}
                  className="px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Address'}
                </button>
                <button onClick={() => { setEditingAddress(false); setAddress(admin?.address || ''); }}
                  className="px-4 py-2 bg-primary-100 text-primary-600 text-xs font-medium rounded-lg hover:bg-primary-200">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-primary-700 whitespace-pre-line">
              {admin?.address || <span className="text-primary-400">No address added yet.</span>}
            </p>
          )}
        </div>
      )}

      {/* Company Logo — airline only */}
      {!isAdmin && (
        <div className="card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                <HiOutlinePhotograph className="w-5 h-5 text-primary-600" />
              </div>
              <h3 className="text-base font-bold text-primary-800">Company Logo</h3>
            </div>
            {!logoFile && (
              <button onClick={() => logoInputRef.current?.click()}
                className="px-3 sm:px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap">
                {admin?.logo_url ? 'Change Logo' : 'Upload Logo'}
              </button>
            )}
          </div>
          {admin?.logo_url && !logoFile && (
            <div className="flex items-center gap-4 p-3 bg-primary-50 rounded-xl border border-primary-100 mb-3">
              <img src={admin.logo_url} alt="Current logo"
                className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-lg border border-primary-200 bg-white flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary-800">Current logo</p>
                <p className="text-xs text-primary-400 mt-0.5">Shown in your profile and admin airline list</p>
              </div>
            </div>
          )}
          {logoFile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 sm:gap-4 p-3 bg-primary-50 rounded-xl border border-primary-100">
                <img src={logoPreview} alt="New logo"
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-lg border border-primary-200 bg-white flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary-800 truncate">{logoFile.name}</p>
                  <p className="text-xs text-primary-400 mt-0.5">{(logoFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <button onClick={cancelLogoChange}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-primary-400 hover:text-red-500 flex-shrink-0">
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 sm:gap-3">
                <button onClick={handleLogoUpload} disabled={uploadingLogo}
                  className="px-3 sm:px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {uploadingLogo && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {uploadingLogo ? 'Uploading…' : 'Save Logo'}
                </button>
                <button onClick={cancelLogoChange}
                  className="px-3 sm:px-4 py-2 bg-primary-100 text-primary-600 text-xs font-medium rounded-lg hover:bg-primary-200">
                  Cancel
                </button>
              </div>
            </div>
          ) : !admin?.logo_url && (
            <button onClick={() => logoInputRef.current?.click()}
              className="w-full flex flex-col items-center gap-2 py-5 border-2 border-dashed border-primary-200 rounded-xl hover:border-accent-400 hover:bg-accent-50/30 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-primary-100 group-hover:bg-accent-100 flex items-center justify-center">
                <HiOutlinePhotograph className="w-5 h-5 text-primary-400 group-hover:text-accent-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-primary-600 group-hover:text-accent-700">Click to upload your company logo</p>
                <p className="text-xs text-primary-400 mt-0.5">PNG, JPG, SVG · max 2 MB</p>
              </div>
            </button>
          )}
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFileChange} className="hidden" />
        </div>
      )}

      {/* Change Email */}
      <div className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <HiOutlineMail className="w-5 h-5 text-primary-600" />
            </div>
            <h3 className="text-base font-bold text-primary-800">Change Email</h3>
          </div>
          {!changingEmail && (
            <button onClick={() => setChangingEmail(true)}
              className="px-3 sm:px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap">
              Change Email
            </button>
          )}
        </div>
        {changingEmail && (
          <div className="space-y-3 mt-2">
            <div>
              <label className="block text-xs font-medium text-primary-500 mb-1">Current Password</label>
              <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)}
                className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                placeholder="Enter current password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-500 mb-1">New Email</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                placeholder="Enter new email address" />
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
              <button onClick={handleEmailSave} disabled={saving}
                className="px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Update Email'}
              </button>
              <button onClick={() => { setChangingEmail(false); setEmailPassword(''); setNewEmail(''); }}
                className="px-4 py-2 bg-primary-100 text-primary-600 text-xs font-medium rounded-lg hover:bg-primary-200">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <HiOutlineLockClosed className="w-5 h-5 text-primary-600" />
            </div>
            <h3 className="text-base font-bold text-primary-800">Change Password</h3>
          </div>
          {!changingPassword && (
            <button onClick={() => setChangingPassword(true)}
              className="px-3 sm:px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap">
              Change Password
            </button>
          )}
        </div>
        {changingPassword && (
          <div className="space-y-3 mt-2">
            <div>
              <label className="block text-xs font-medium text-primary-500 mb-1">Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                placeholder="Enter current password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-500 mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                placeholder="At least 6 characters" />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-500 mb-1">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                placeholder="Re-enter new password" />
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
              <button onClick={handlePasswordSave} disabled={saving}
                className="px-4 py-2 bg-[#0000ff] text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Update Password'}
              </button>
              <button onClick={() => { setChangingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                className="px-4 py-2 bg-primary-100 text-primary-600 text-xs font-medium rounded-lg hover:bg-primary-200">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>


      {/* ── AIRLINE: Account Information (replaces System Information) ── */}
      {!isAdmin && (
        <div className="card p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <HiOutlineInformationCircle className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-base font-bold text-primary-800">Account Information</h3>
          </div>
          <div className="space-y-0">
            {[
              { label: 'Airline Name',    value: admin?.airlineName || '—' },
              { label: 'Contact Person',  value: admin?.name        || '—' },
              { label: 'Account Type',    value: 'Airline Portal' },
              { label: 'Portal Access',   value: 'Submission & Tracking', highlight: true },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-primary-100 last:border-0 gap-4">
                <span className="text-sm text-primary-500 flex-shrink-0">{label}</span>
                <span className={`text-sm font-medium text-right truncate max-w-[55%] ${highlight ? 'text-emerald-600' : 'text-primary-800'}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <HiOutlineCheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Your submissions are reviewed by the IFOA admin team. Certificates are issued after verification. For any changes to submitted records, please contact IFOA directly.
            </p>
          </div>
        </div>
      )}

    </motion.div>
  );
}
