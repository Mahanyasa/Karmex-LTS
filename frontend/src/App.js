import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import { PrivacyPolicy, TermsConditions } from "./pages/Legal";
import { NotificationProvider } from "./context/NotificationContext";
import Profile from "./pages/Profile";
import OperationHud from "./components/OperationHud";

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
       <OperationHud />
       <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />
          <Route path="/u/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
       </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
