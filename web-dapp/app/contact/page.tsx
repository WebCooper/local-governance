"use client";

import Link from "next/link";
import { Landmark, Mail, Shield, User, GraduationCap, Building2, BookOpen, ArrowLeft, Send } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setIsSending(true);
    setTimeout(() => {
      toast.success("Thank you! Your message has been sent to the research project team.");
      setFormData({ name: "", email: "", subject: "", message: "" });
      setIsSending(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 py-6 px-4 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-50 text-blue-700 font-extrabold text-xs rounded-full uppercase tracking-wider">
              Academic Research Project
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-10 space-y-12">
        
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100/60 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider">
            <GraduationCap className="h-4 w-4" /> Final Year Undergraduate Research
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight">
            Contact &amp; Project Details
          </h1>
          <p className="text-slate-600 text-sm md:text-base leading-relaxed">
            AuraChain is a final year undergraduate engineering project exploring decentralized, privacy-preserving local e-governance through Zero-Knowledge Proofs and blockchain technology.
          </p>
        </div>

        {/* Academic Project Credentials Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-10 space-y-8">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Project Overview &amp; Supervision</h2>
              <p className="text-xs text-slate-500">Department of Electrical and Information Engineering</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Project Title & Metadata */}
            <div className="space-y-4 bg-slate-50/70 p-6 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Title</span>
                <p className="text-sm font-bold text-slate-900 leading-snug">
                  Framework for Blockchain-Based Community-Assisted Privacy-Preserving Reporting Service for Local Governance
                </p>
              </div>

              <div className="space-y-1 pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Research Focus</span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Combining permissioned Ethereum Virtual Machine (EVM) smart contracts, Zero-Knowledge Proof (ZKP) citizen identity verification, AI Oracle content moderation, and off-chain IPFS storage to eliminate inefficiencies in local government issue triage.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 text-xs font-semibold text-blue-700">
                <Shield className="h-4 w-4 text-blue-600" />
                <span>Zero-Knowledge Proofs • EVM Smart Contracts • AI Moderation</span>
              </div>
            </div>

            {/* University & Supervisor Info */}
            <div className="space-y-5 flex flex-col justify-between">
              
              {/* Supervisor Card */}
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-50/50 border border-blue-100">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Project Supervisor</span>
                  <h3 className="text-base font-bold text-slate-900">Dr. Subodha Gunawardena</h3>
                  <p className="text-xs text-slate-600 font-medium">Senior Lecturer, Department of Electrical &amp; Information Engineering</p>
                  <a
                    href="mailto:subodha@eie.ruh.ac.lk"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-bold pt-1 transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5" /> subodha@eie.ruh.ac.lk
                  </a>
                </div>
              </div>

              {/* Institution Card */}
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Institution</span>
                  <h3 className="text-base font-bold text-slate-900">University of Ruhuna</h3>
                  <p className="text-xs text-slate-600">Faculty of Engineering • Hapugala, Galle, Sri Lanka</p>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Contact Form Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="space-y-4 md:col-span-1">
            <h2 className="text-2xl font-bold text-slate-900">Get in Touch</h2>
            <p className="text-slate-600 text-sm leading-relaxed">
              Have questions about our research, architecture, or smart contract deployment? Reach out to our project team.
            </p>

            <div className="space-y-3 pt-4 text-xs text-slate-600">
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                <Mail className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Academic Contact</div>
                  <div>subodha@eie.ruh.ac.lk</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                <Landmark className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Department</div>
                  <div>Electrical &amp; Info Engineering, Faculty of Engineering</div>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter your email"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Inquiry about AuraChain research or system demo"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Message *
                </label>
                <textarea
                  rows={4}
                  required
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Write your message here..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium text-slate-900 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                {isSending ? "Sending Message..." : (
                  <>
                    Send Message
                    <Send className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-slate-200 bg-white text-xs text-slate-500 font-medium">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-blue-600 text-base tracking-tight">AuraChain</span>
            <span>© 2026 University of Ruhuna • Faculty of Engineering</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy-policy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
            <Link href="/whitepaper" className="hover:text-slate-900 transition-colors">Whitepaper</Link>
            <Link href="/contact" className="hover:text-slate-900 font-bold text-blue-600 transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
