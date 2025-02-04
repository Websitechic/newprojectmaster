import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Upload, MessageSquare, Calendar } from "lucide-react";
import type { Project, Task, ProjectMember } from "@db/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const queryClient = useQueryClient();
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
    <div className="flex h-screen bg-slate-900">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="p-6 flex-1">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{project?.name}</h1>
              <div className="flex items-center mt-2 space-x-2">
                {members.map((member, i) => (
                  <Avatar key={i} className="w-8 h-8">
                    <AvatarFallback>{member.name?.[0]}</AvatarFallback>
                  </Avatar>
                ))}
                <Button variant="outline" size="sm">+ Set up people</Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-white">Message Board</h2>
                <ScrollArea className="h-[300px]">
                  {/* Message board items */}
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar className="w-6 h-6">
                          <AvatarFallback>JD</AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-white">Project Brief</span>
                      </div>
                      <p className="text-sm text-slate-300">Project updates and discussions</p>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-white">To-dos</h2>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {tasks.map((task, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Checkbox />
                        <span className="text-sm text-slate-300">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-white">Docs & Files</h2>
                <ScrollArea className="h-[300px]">
                  <div className="grid grid-cols-2 gap-2">
                    {/* File previews */}
                    <div className="aspect-square bg-slate-700/50 rounded-lg p-2 flex items-center justify-center">
                      <FileText className="h-8 w-8 text-slate-400" />
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-white">Chat</h2>
                <ScrollArea className="h-[300px] mb-4">
                  {/* Chat messages */}
                </ScrollArea>
                <div className="flex gap-2">
                  <Input 
                    className="bg-slate-700 border-slate-600"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                  />
                  <Button variant="secondary">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-white">Schedule</h2>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {/* Schedule items */}
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span className="text-sm text-white">Upcoming deadlines</span>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}