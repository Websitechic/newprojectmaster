import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, MessageSquare, FileText } from "lucide-react";
import type { Project } from "@db/schema";

export default function StaffProjectDetails() {
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
      title: "My Tasks",
      icon: ClipboardList,
      description: "View and manage your assigned tasks for this project",
      path: `/dashboard/projects/${id}/staff-tasks`
    },
    {
      title: "Team Chat",
      icon: MessageSquare,
      description: "Communicate with your team members",
      path: `/dashboard/projects/${id}/team-chat`
    },
    {
      title: "Resources",
      icon: FileText,
      description: "Access project documents and files",
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
            <div className="mt-2 flex items-center gap-4">
              <div className="text-sm">
                <span className="font-medium">Progress: </span>
                <span>{project.progress || 0}%</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">Status: </span>
                <span className="capitalize">{project.status}</span>
              </div>
            </div>
          </div>

          {/* Project Plan Section */}
          <div className="mb-8">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold">Project Plan</h2>
                <CardDescription>
                  Project timeline and your role in the delivery
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium text-sm mb-2">Timeline</h3>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><span className="font-medium">Start:</span> {new Date(project.startDate || '').toLocaleDateString()}</p>
                        <p><span className="font-medium">End:</span> {new Date(project.endDate || '').toLocaleDateString()}</p>
                        <p><span className="font-medium">Duration:</span> {
                          project.startDate && project.endDate 
                            ? Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 3600 * 24)) + ' days'
                            : 'N/A'
                        }</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium text-sm mb-2">Project Info</h3>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><span className="font-medium">Type:</span> <span className="capitalize">{project.type?.replace('_', ' ')}</span></p>
                        <p><span className="font-medium">Category:</span> <span className="capitalize">{project.category?.replace('_', ' ')}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium text-sm mb-2">Progress Overview</h3>
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
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium text-sm mb-2">Current Phase</h3>
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${
                          project.progress === 0 ? 'bg-gray-400' :
                          project.progress < 50 ? 'bg-yellow-500' :
                          project.progress < 100 ? 'bg-blue-500' : 'bg-green-500'
                        }`}></div>
                        <span className="text-sm text-muted-foreground">
                          {project.progress === 0 ? 'Not Started' :
                           project.progress < 50 ? 'Initial Development' :
                           project.progress < 100 ? 'Active Development' : 'Completed'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t">
                  <h3 className="font-medium text-sm mb-3">Project Milestones</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm">Project Kickoff</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(project.startDate || '').toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${project.progress && project.progress >= 50 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-sm">Mid-point Review</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {project.startDate && project.endDate 
                          ? new Date(new Date(project.startDate).getTime() + (new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / 2).toLocaleDateString()
                          : 'TBD'
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${project.progress && project.progress >= 100 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-sm">Project Delivery</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(project.endDate || '').toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      <CardDescription>
                        {card.description}
                      </CardDescription>
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