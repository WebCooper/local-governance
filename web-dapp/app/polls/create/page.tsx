"use client";

import React, { useState, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";
import { useRouter } from "next/navigation";
import axios from "axios";

export default function CreatePollPage() {
    const { isAuthority, isConnecting, account } = useAdmin();
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
            alert("Unauthorized Access. Authorities Only.");
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
        setSubmitting(true);

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

            const response = await axios.post("http://localhost:4000/polling/create", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            if (response.data.success) {
                alert(`Poll pinned and broadcasted successfully! CID: ${response.data.data.pollCID}`);
                router.push("/polls");
            }
        } catch (error: any) {
            console.error(error);
            alert(`Submission failure: ${error.response?.data?.message || error.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    if (isConnecting || (!isAuthority && account === null)) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-black text-white">
                <p className="text-xl">Authenticating Local Authority Context...</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-black text-white p-8">
            <div className="max-w-xl mx-auto border border-gray-800 bg-gray-950 p-6 rounded-xl">
                <h1 className="text-2xl font-bold text-green-500 mb-6">Create Official Government Poll</h1>

                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Poll Title</label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
                            className="w-full bg-gray-900 border border-gray-800 p-2 rounded text-white focus:outline-none focus:border-green-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Strategic Context / Description</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4}
                            className="w-full bg-gray-900 border border-gray-800 p-2 rounded text-white focus:outline-none focus:border-green-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Ballot Class Mechanics</label>
                        <select value={pollType} onChange={(e) => setPollType(parseInt(e.target.value))}
                            className="w-full bg-gray-900 border border-gray-800 p-2 rounded text-white focus:outline-none focus:border-green-500">
                            <option value={0}>True / False Binary Split</option>
                            <option value={1}>Multiple Choice Slate</option>
                        </select>
                    </div>

                    {pollType === 1 && (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-400">Slated Options</label>
                            {options.map((option, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                    <input type="text" value={option} onChange={(e) => handleOptionChange(index, e.target.value)} required placeholder={`Choice Option #${index + 1}`}
                                        className="flex-1 bg-gray-900 border border-gray-800 p-2 rounded text-white focus:outline-none focus:border-green-500" />
                                    {options.length > 2 && (
                                        <button type="button" onClick={() => removeOptionField(index)} className="text-red-500 hover:text-red-400 px-2">
                                            Remove
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button type="button" onClick={addOptionField} className="text-sm bg-gray-800 text-gray-200 px-3 py-1.5 rounded hover:bg-gray-700">
                                + Append Option Field
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Voting Window Deadline Expiry</label>
                        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required
                            className="w-full bg-gray-900 border border-gray-800 p-2 rounded text-white focus:outline-none focus:border-green-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Supplemental Reference Visuals (Max 5)</label>
                        <input type="file" multiple accept="image/*" onChange={handleFileChange}
                            className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-800 file:text-green-400 hover:file:bg-gray-700" />
                    </div>

                    <button type="submit" disabled={submitting}
                        className="w-full font-bold bg-green-600 hover:bg-green-500 text-black p-3 rounded-lg transition disabled:opacity-50">
                        {submitting ? "Broadcasting State & Pinning Assets..." : "Sign & Create Ballot Tracker"}
                    </button>
                </form>
            </div>
        </main>
    );
}