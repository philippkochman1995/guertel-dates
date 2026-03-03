import { Route, Routes } from "react-router-dom";
import Index from "./pages/Index";
import Imprint from "./pages/Imprint";
import NotFound from "./pages/NotFound";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/imprint" element={<Imprint />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
