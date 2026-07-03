"use client";

import React, { useState, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { getPollingContract } from "@/lib/contracts/polling";
import toast from "react-hot-toast";

export default function CreatePollPage() {
    const { isAuthority, isConnecting, account, provider, connectWallet } = useAdmin();
    const router = useRouter();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [pollType, setPollType] = useState<number>(0); // 0: True/False, 1: MultiChoice
    const [options, setOptions] = useState<string[]>(["", ""]);
    const [deadline, setDeadline] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isConnecting && !isAuthority && account !== null) {
            toast.error("Unauthorized Access. Authorities Only.");
            router.push("/polls");
        }
    }, [isAuthority, isConnecting, account, router]);

    const handleOptionChange = (index: number, value: string) => {
        const updated = [...options];
        updated[index] = value;
        setOptions(updated);
    };

    const addOptionField = () => setOptions([...options, ""]);
    const removeOptionField = (index: number) => {
        if (options.length > 2) {
            setOptions(options.filter((_, i) => i !== index));
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setImages(Array.from(e.target.files).slice(0, 5));
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!provider) {
            toast.error("Web3 Provider not found. Please connect your wallet.");
            return;
        }

        setSubmitting(true);
        const loadingToast = toast.loading("Uploading metadata and creating poll...");

        try {
            const unixDeadline = Math.floor(new Date(deadline).getTime() / 1000);
            const finalOptions = pollType === 0 ? ["False", "True"] : options;

            const formData = new FormData();
            formData.append("title", title);
            formData.append("description", description);
            formData.append("pollType", pollType.toString());
            formData.append("deadline", unixDeadline.toString());
            formData.append("options", JSON.stringify(finalOptions));

            images.forEach((img) => {
                formData.append("images", img);
            });

            const response = await axios.post("/api/polls/upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            if (response.data.success) {
                const ipfsCid = response.data.cid;

                toast.loading("Signing and broadcasting transaction...", { id: loadingToast });

                const signer = await provider.getSigner();
                const contract = getPollingContract(signer);

                const tx = await contract.createOfficialPoll(ipfsCid, unixDeadline, pollType);
                await tx.wait();

                toast.success("Poll successfully created and broadcasted on-chain!", { id: loadingToast });
                setTimeout(() => router.push("/polls"), 1500);
            }
        } catch (error: any) {
            console.error(error);
            toast.error(`Submission failure: ${error.response?.data?.message || error.message}`, { id: loadingToast });
        } finally {
            setSubmitting(false);
        }
    };

    if (isConnecting) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-800 p-4">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-semibold animate-pulse">Authenticating Local Authority Context...</p>
                </div>
            </div>
        );
    }

    if (!account) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-slate-100 animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Authority Required</h1>
                    <p className="text-slate-500 mb-8 text-sm leading-relaxed">Please connect your official MetaMask authority wallet to create a decentralized opinion poll.</p>
                    <button
                        onClick={connectWallet}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition-all flex justify-center items-center gap-2"
                    >
                        Connect Wallet
                    </button>
                    <Link href="/polls" className="inline-block mt-6 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                        ← Back to Polls Feed
                    </Link>
                </div>
            </div>
        );
    }

    if (!isAuthority) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-100 animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
                    <p className="text-slate-600 mb-4 font-mono text-xs break-all bg-slate-50 p-3 rounded">{account}</p>
                    <p className="text-slate-500 mb-6 text-sm">This wallet address is not registered as an Authority on-chain.</p>
                    <Link href="/polls" className="inline-block text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                        ← Back to Polls Feed
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-[#f8fafc] text-slate-800 p-4 md:p-8 flex items-center justify-center">
            <div className="w-full max-w-2xl bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-sm">
                <div className="mb-4">
                    <Link href="/admin" className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                        ← Back to Admin Dashboard
                    </Link>
                </div>
                <h1 className="text-3xl font-extrabold text-blue-600 mb-1 tracking-tight">Create Poll</h1>
                <p className="text-sm text-slate-500 mb-6">Initialize a new decentralized opinion poll representing authority directives.</p>

                <form onSubmit={handleFormSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold mb-1.5 text-slate-500">Poll Title</label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm" />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1.5 text-slate-500">Strategic Context / Description</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4}
                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm" />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1.5 text-slate-500">Poll Type</label>
                        <select value={pollType} onChange={(e) => setPollType(parseInt(e.target.value))}
                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm">
                            <option value={0}>Yes / No Decision</option>
                            <option value={1}>Multiple Choice Poll</option>
                        </select>
                    </div>

                    {pollType === 1 && (
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-slate-500">Slated Options</label>
                            {options.map((option, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                    <input type="text" value={option} onChange={(e) => handleOptionChange(index, e.target.value)} required placeholder={`Choice Option #${index + 1}`}
                                        className="flex-1 bg-white border border-slate-200 p-2.5 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm" />
                                    {options.length > 2 && (
                                        <button type="button" onClick={() => removeOptionField(index)} className="text-red-500 hover:text-red-600 font-semibold px-2 text-sm transition">
                                            Remove
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button type="button" onClick={addOptionField} className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold px-3 py-2 rounded-xl transition border border-slate-200">
                                + Append Option Field
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold mb-1.5 text-slate-500">Voting Window Deadline Expiry</label>
                        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required
                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm" />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1.5 text-slate-500">Supplemental Reference Visuals (Max 5)</label>
                        <input type="file" multiple accept="image/*" onChange={handleFileChange}
                            className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-200 file:text-xs file:font-bold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 transition" />
                    </div>

                    <button type="submit" disabled={submitting}
                        className="w-full font-bold bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition disabled:opacity-50 shadow-sm shadow-blue-500/10">
                        {submitting ? "Broadcasting State & Pinning Assets..." : "Sign & Create Poll"}
                    </button>
                </form>
            </div>
        </main>
    );
}