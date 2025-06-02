import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, MessageSquare, Users, FileText } from "lucide-react";
import type { Project } from "@db/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["api/projects", id],
    queryFn: () => fetch(`/api/projects/${id}`).then(res => res.json())
  });

  if (isLoading || !project) {
    return <div>Loading...</div>;
  }

  const cards = [
    {
      title: "Tasks",
      icon: ClipboardList,
      description: "Manage and track project tasks in Kanban view",
      path: `/dashboard/projects/${id}/tasks`
    },
    {
      title: "Team Chat",
      icon: MessageSquare,
      description: "Internal communication between team members",
      path: `/dashboard/projects/${id}/team-chat`
    },
    {
      title: "Client Communication",
      icon: Users,
      description: "Direct communication channel with the client",
      path: `/dashboard/projects/${id}/client-chat`
    },
    {
      title: "Resources",
      icon: FileText,
      description: "Project documents and important files",
      path: `/dashboard/projects/${id}/resources`
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground">{project.description}</p>
          </div>

          {/* Project Plan Section */}
          <div className="mb-8">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold">Project Plan</h2>
                <p className="text-sm text-muted-foreground">
                  Overview of project timeline, milestones, and key deliverables
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">Timeline</h3>
                    <div className="text-sm text-muted-foreground">
                      <p><span className="font-medium">Start:</span> {new Date(project.startDate || '').toLocaleDateString()}</p>
                      <p><span className="font-medium">End:</span> {new Date(project.endDate || '').toLocaleDateString()}</p>
                      <p><span className="font-medium">Duration:</span> {
                        project.startDate && project.endDate 
                          ? Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 3600 * 24)) + ' days'
                          : 'N/A'
                      }</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">Progress</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Overall Progress</span>
                        <span>{project.progress || 0}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${project.progress || 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Status: <span className="capitalize font-medium">{project.status}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">Project Details</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><span className="font-medium">Type:</span> <span className="capitalize">{project.type?.replace('_', ' ')}</span></p>
                      <p><span className="font-medium">Category:</span> <span className="capitalize">{project.category?.replace('_', ' ')}</span></p>
                      <p><span className="font-medium">Client:</span> {project.clientId ? 'Assigned' : 'Pending'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t">
                  <h3 className="font-medium text-sm mb-3">Key Milestones</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div>
                        <p className="text-sm font-medium">Project Kickoff</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(project.startDate || '').toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg">
                      <div className={`w-2 h-2 rounded-full ${project.progress && project.progress >= 50 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <div>
                        <p className="text-sm font-medium">Mid-point Review</p>
                        <p className="text-xs text-muted-foreground">
                          {project.startDate && project.endDate 
                            ? new Date(new Date(project.startDate).getTime() + (new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / 2).toLocaleDateString()
                            : 'TBD'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg">
                      <div className={`w-2 h-2 rounded-full ${project.progress && project.progress >= 100 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <div>
                        <p className="text-sm font-medium">Project Completion</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(project.endDate || '').toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg">
                      <div className={`w-2 h-2 rounded-full ${project.status === 'active' ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                      <div>
                        <p className="text-sm font-medium">Delivery & Handover</p>
                        <p className="text-xs text-muted-foreground">
                          Post completion
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card 
                  key={card.title}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setLocation(card.path)}
                >
                  <CardHeader className="flex flex-row items-center gap-4">
                    <Icon className="h-6 w-6" />
                    <div>
                      <h3 className="text-lg font-semibold">{card.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}