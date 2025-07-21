
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayCircle } from "lucide-react";

export default function GuideVideos() {
  const [location] = useLocation();

  const videoCategories = [
    {
      title: "Getting Started",
      videos: [
        { title: "Dashboard Overview", duration: "5:30", thumbnail: "/api/placeholder/300/180" },
        { title: "Project Navigation", duration: "4:15", thumbnail: "/api/placeholder/300/180" },
        { title: "Communication Tools", duration: "6:20", thumbnail: "/api/placeholder/300/180" },
      ]
    },
    {
      title: "Project Management", 
      videos: [
        { title: "Understanding Project Timeline", duration: "8:45", thumbnail: "/api/placeholder/300/180" },
        { title: "Task Progress Tracking", duration: "5:50", thumbnail: "/api/placeholder/300/180" },
        { title: "Resource Management", duration: "7:30", thumbnail: "/api/placeholder/300/180" },
      ]
    },
    {
      title: "Support & Maintenance",
      videos: [
        { title: "How to Submit Support Requests", duration: "4:40", thumbnail: "/api/placeholder/300/180" },
        { title: "Emergency Contact Procedures", duration: "3:20", thumbnail: "/api/placeholder/300/180" },
        { title: "Maintenance Schedules", duration: "5:15", thumbnail: "/api/placeholder/300/180" },
      ]
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <PlayCircle className="h-6 w-6 text-blue-600" />
                  Guide Videos
                </h1>
                <p className="text-muted-foreground">
                  Learn how to effectively use our platform with these helpful video tutorials
                </p>
              </div>
            </div>

            {videoCategories.map((category, categoryIndex) => (
              <div key={categoryIndex} className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">{category.title}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.videos.map((video, videoIndex) => (
                    <Card key={videoIndex} className="hover:shadow-md transition-shadow cursor-pointer">
                      <div className="relative">
                        <div className="w-full h-40 bg-gray-200 rounded-t-lg flex items-center justify-center">
                          <PlayCircle className="h-12 w-12 text-blue-600" />
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                          {video.duration}
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium text-gray-900 mb-2">{video.title}</h3>
                        <p className="text-sm text-gray-500">Duration: {video.duration}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <PlayCircle className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
                    <p className="text-blue-800 mb-4">
                      Can't find what you're looking for? Contact our support team for personalized assistance.
                    </p>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                      Contact Support
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
