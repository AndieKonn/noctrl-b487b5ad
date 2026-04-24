import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import Index from "./pages/Index.tsx";
import AdminPortal from "./pages/AdminPortal.tsx";
import AdminPortalDashboard from "./pages/AdminPortalDashboard.tsx";
import AdminList from "./pages/AdminList.tsx";
import NotFound from "./pages/NotFound.tsx";
import Verify from "./pages/Verify.tsx";
import StaffLogin from "./pages/StaffLogin.tsx";
import StaffScan from "./pages/StaffScan.tsx";
import RequireStaff from "./components/RequireStaff.tsx";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/admin-portal" element={<AdminPortal />} />
            <Route path="/admin-portal/dashboard" element={<AdminPortalDashboard />} />
            <Route path="/list" element={<AdminList />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/staff/login" element={<StaffLogin />} />
            <Route
              path="/staff/scan"
              element={
                <RequireStaff>
                  <StaffScan />
                </RequireStaff>
              }
            />
            {/* Any other /staff/* path → bounce staff to the scanner */}
            <Route
              path="/staff/*"
              element={
                <RequireStaff>
                  <StaffScan />
                </RequireStaff>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
