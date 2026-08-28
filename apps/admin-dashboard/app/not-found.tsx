"use client";

import Link from "next/link";
import { AlertCircle, Home } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Card, CardContent } from "@blush/ui/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse dark:bg-red-500/20" />
              <AlertCircle className="relative h-16 w-16 text-red-500" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2 dark:text-slate-100">404</h1>
          <h2 className="text-xl font-semibold text-slate-700 mb-4 dark:text-slate-300">Page Not Found</h2>
          <p className="text-slate-600 mb-8 dark:text-slate-400 leading-relaxed">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>
          <div id="not-found-button-group" className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
