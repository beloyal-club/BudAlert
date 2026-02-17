import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

interface NavLink {
  to: string;
  label: string;
}

const navLinks: NavLink[] = [
  { to: "/", label: "Overview" },
  { to: "/brands", label: "Brands" },
  { to: "/retailers", label: "Retailers" },
  { to: "/prices", label: "Prices" },
  { to: "/analytics", label: "Analytics" },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden p-2 rounded-lg hover:bg-gray-800 transition"
        aria-label="Toggle navigation"
      >
        <div className="w-6 h-5 flex flex-col justify-between">
          <span
            className={`h-0.5 w-full bg-white rounded transition-transform ${
              isOpen ? "rotate-45 translate-y-2" : ""
            }`}
          />
          <span
            className={`h-0.5 w-full bg-white rounded transition-opacity ${
              isOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`h-0.5 w-full bg-white rounded transition-transform ${
              isOpen ? "-rotate-45 -translate-y-2" : ""
            }`}
          />
        </div>
      </button>

      {/* Desktop Navigation */}
      <div className="hidden md:flex space-x-4">
        {navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`hover:text-green-400 transition ${
              location.pathname === link.to ? "text-green-400" : ""
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer */}
          <div className="fixed top-0 right-0 h-full w-64 bg-gray-900 z-50 shadow-xl md:hidden">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <span className="text-lg font-semibold text-green-400">Menu</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition"
              >
                ✕
              </button>
            </div>

            <nav className="p-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className={`block px-4 py-3 rounded-lg transition ${
                    location.pathname === link.to
                      ? "bg-green-900/50 text-green-400"
                      : "hover:bg-gray-800"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
