import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PortalGuard from "./components/PortalGuard";
import { ThemeProvider } from "./contexts/ThemeContext";
import AboutPage from "./pages/AboutPage";
import AdminAdmissionsPage from "./pages/AdminAdmissionsPage";
import AdminAcademicPage from "./pages/AdminAcademicPage";
import AdminFinancePage from "./pages/AdminFinancePage";
import AdminInventoryPage from "./pages/AdminInventoryPage";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminOperationsPage from "./pages/AdminOperationsPage";
import AdminPage from "./pages/AdminPage";
import AdminStudentsPage from "./pages/AdminStudentsPage";
import AdmissionsPage from "./pages/AdmissionsPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import ContactPage from "./pages/ContactPage";
import GalleryPage from "./pages/GalleryPage";
import Home from "./pages/Home";
import ProgramsPage from "./pages/ProgramsPage";
import StorePage from "./pages/StorePage";
import StaffPage from "./pages/StaffPage";
import StudentPortalPage from "./pages/StudentPortalPage";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/about"} component={AboutPage} />
      <Route path={"/programs"} component={ProgramsPage} />
      <Route path={"/gallery"} component={GalleryPage} />
      <Route path={"/contact"} component={ContactPage} />
      <Route path={"/apply"} component={AdmissionsPage} />
      <Route path={"/store"} component={StorePage} />
      <Route path={"/appointments"} component={AppointmentsPage} />
      <Route path={"/portal"} component={() => <PortalGuard allowedRoles={["student", "admin"]}><StudentPortalPage /></PortalGuard>} />
      <Route path={"/staff"} component={() => <PortalGuard allowedRoles={["staff", "admin"]}><StaffPage /></PortalGuard>} />
      <Route path={"/admin"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminPage /></PortalGuard>} />
      <Route path={"/admin/admissions"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminAdmissionsPage /></PortalGuard>} />
      <Route path={"/admin/students"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminStudentsPage /></PortalGuard>} />
      <Route path={"/admin/academics"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminAcademicPage /></PortalGuard>} />
      <Route path={"/admin/inventory"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminInventoryPage /></PortalGuard>} />
      <Route path={"/admin/orders"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminOrdersPage /></PortalGuard>} />
      <Route path={"/admin/finance"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminFinancePage /></PortalGuard>} />
      <Route path={"/admin/operations"} component={() => <PortalGuard allowedRoles={["admin"]}><AdminOperationsPage /></PortalGuard>} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
