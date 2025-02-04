
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, MessageSquare, Calendar, Plus } from "lucide-react";
import type { Project, Task, ProjectMember } from "@db/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const [newMessage, setNewMessage] = useState("");

  const { data: project } = useQuery<Project>({
    queryKey: ["api/projects", id],
    queryFn: () => fetch(`/api/projects/${id}`).then(res => res.json())
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["api/projects", id, "tasks"],
    queryFn: () => fetch(`/api/projects/${id}/tasks`).then(res => res.json())
  });

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ["api/projects", id, "members"],
    queryFn: () => fetch(`/api/projects/${id}/members`).then(res => res.json())
  });

  return (
    <div className="flex h-screen bg-[#1A2233]">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 p-6">
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-semibold text-white">{project?.name}</h1>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Set up people
              </Button>
            </div>
            <div className="flex mt-2 -space-x-2">
              {members.map((member, i) => (
                <Avatar key={i} className="border-2 border-[#1A2233]">
                  <AvatarFallback>{member.name?.[0]}</AvatarFallback>
                </Avatar>
              ))}
              <Badge className="ml-4" variant="secondary">+1 just following</Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card className="bg-[#1E293B] border-0">
              <div className="p-4">
                <h2 className="text-lg font-semibold mb-4 text-white">Message Board</h2>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {['Design Phase', 'Website Plan', 'Project Collaboration', 'Project Brief'].map((title, i) => (
                      <div key={i} className="p-3 bg-[#2D3748] rounded-lg hover:bg-[#374151] cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback>U{i}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-white">{title}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </Card>

            <Card className="bg-[#1E293B] border-0">
              <div className="p-4">
                <h2 className="text-lg font-semibold mb-4 text-white">To-dos</h2>
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-white mb-2">Development</h3>
                  {tasks.filter(t => t.type === 'development').map((task, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <input type="checkbox" className="rounded border-gray-600" />
                      <span className="text-sm text-gray-300">{task.title}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white mb-2">Design</h3>
                  {tasks.filter(t => t.type === 'design').map((task, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <input type="checkbox" className="rounded border-gray-600" />
                      <span className="text-sm text-gray-300">{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="bg-[#1E293B] border-0">
              <div className="p-4">
                <h2 className="text-lg font-semibold mb-4 text-white">Docs & Files</h2>
                <ScrollArea className="h-[400px]">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="aspect-[3/4] bg-[#2D3748] rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-[#374151]">
                      <FileText className="h-8 w-8 text-gray-400 mb-2" />
                      <span className="text-xs text-gray-400">Website Content</span>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-[#1E293B] border-0">
              <div className="p-4">
                <h2 className="text-lg font-semibold mb-4 text-white">Chat</h2>
                <ScrollArea className="h-[300px] mb-4">
                  <div className="space-y-4">
                    {/* Chat messages will be populated here */}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Input 
                    className="bg-[#2D3748] border-0"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                  />
                  <Button variant="secondary">Send</Button>
                </div>
              </div>
            </Card>

            <Card className="bg-[#1E293B] border-0">
              <div className="p-4">
                <h2 className="text-lg font-semibold mb-4 text-white">Schedule</h2>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    <div className="p-3 bg-[#2D3748] rounded-lg">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-white">MON, FEB 3</span>
                      </div>
                      <div className="mt-2 pl-6">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded border-gray-600" />
                          <span className="text-sm text-gray-300">Share development link with client</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
