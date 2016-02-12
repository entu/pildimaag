1. Configurations

Configurations are stored in Entu. Expecting something like this:

    {
        "name": "Saali pildimaag.",
        "pageSize": 21,
        "entuUrl": "https://saal.entu.ee",
        "apiUser": "4008",
        "apiKey": "oTYwANgSteCtYpHeRKLEtindEwFloGroD",
        "relaxBetween": {
            "roundtripMinutes": 1,
            "tasksSeconds": 10,
            "pagesSeconds": 1
        },
        "tasks": [
            {
                "name": "Saali lavastuste karusselli ja galerii pildid",
                "source": {
                    "definitions": ["performance"],
                    "property": "photo-original"
                },
                "targets": [
                    {
                        "property": "photo",
                        "format": "png",
                        "fixWidth": 200,
                        "fixHeight": 200,
                        "crop": "auto",
                        "forceKeepInSync": true,
                        "fileNamePrefix": "",
                        "fileNameSuffix": " 200"
                    },
                    {
                        "property": "photo-medium",
                        "format": "jpg",
                        "fixWidth": 350,
                        "fixHeight": 350,
                        "crop": "center",
                        "forceKeepInSync": true,
                        "fileNamePrefix": "",
                        "fileNameSuffix": " 350x350"
                    },
                    {
                        "property": "photo-big",
                        "format": "jpg",
                        "fixWidth": 1400,
                        "fixHeight": 700,
                        "crop": "center",
                        "forceKeepInSync": true,
                        "fileNamePrefix": "",
                        "fileNameSuffix": " 1400x700"
                    }
                ]
            },
            {
                "name": "Saali sündmuste karusselli ja galerii pildid",
                "source": {
                    "definitions": ["event"],
                    "property": "photo-original"
                },
                "targets": [
                    {
                        "property": "photo",
                        "format": "png",
                        "fixWidth": 200,
                        "fixHeight": 200,
                        "crop": "auto",
                        "forceKeepInSync": false,
                        "fileNamePrefix": "",
                        "fileNameSuffix": " 200"
                    },
                    {
                        "property": "photo-medium",
                        "format": "jpg",
                        "fixWidth": 350,
                        "fixHeight": 350,
                        "crop": "center",
                        "forceKeepInSync": false,
                        "fileNamePrefix": "",
                        "fileNameSuffix": " 350x350"
                    },
                    {
                        "property": "photo-big",
                        "format": "jpg",
                        "fixWidth": 1400,
                        "fixHeight": 700,
                        "crop": "center",
                        "forceKeepInSync": false,
                        "fileNamePrefix": "",
                        "fileNameSuffix": " 1400x700"
                    }
                ]
            }
        ]
    }    



Prepared tasks for single entity look like this. 

	{
	    "entityId": 4030,
	    "tasks": [
	        {
	            "jobName": "Kodulehe karusselli ja galerii pildid",
	            "toCreate": [
	                { "value": "pure_mind_2.jpg",
	                    "id": 82936,
	                    "file": "https://saal.entu.ee/api2/file-356",
	                    "targets": [
	                        { "fileName": "pure_mind_2 200.jpg",
	                            "property": "photo",
	                            "format": "png",
	                            "fixWidth": 200,
	                            "fixHeight": 200,
	                            "crop": "auto"
	                        },
	                        { "fileName": "pure_mind_2 350x350.jpg",
	                            "property": "photo-medium",
	                            "format": "jpg",
	                            "fixWidth": 350,
	                            "fixHeight": 350,
	                            "crop": "center"
	                        },
	                        { "fileName": "pure_mind_2 1400x700.jpg",
	                            "property": "photo-big",
	                            "format": "jpg",
	                            "fixWidth": 1400,
	                            "fixHeight": 700,
	                            "crop": "center"
	                        }
	                    ]
	                },
	                { "value": "pure_mind_1.jpg",
	                    "id": 82938,
	                    "file": "https://saal.entu.ee/api2/file-358",
	                    "targets": [
	                        { "fileName": "pure_mind_1 200.jpg",
	                            "property": "photo",
	                            "format": "png",
	                            "fixWidth": 200,
	                            "fixHeight": 200,
	                            "crop": "auto"
	                        },
	                        { "fileName": "pure_mind_1 350x350.jpg",
	                            "property": "photo-medium",
	                            "format": "jpg",
	                            "fixWidth": 350,
	                            "fixHeight": 350,
	                            "crop": "center"
	                        },
	                        { "fileName": "pure_mind_1 1400x700.jpg",
	                            "property": "photo-big",
	                            "format": "jpg",
	                            "fixWidth": 1400,
	                            "fixHeight": 700,
	                            "crop": "center"
	                        }
	                    ]
	                }
	            ],
	            "toRemove": [
	                { "file": "https://saal.entu.ee/api2/file-357",
	                    "id": 82937,
	                    "created_by": "614",
	                    "value": "pure_mind_1_galerii.jpg"
	                },
	                { "file": "https://saal.entu.ee/api2/file-354",
	                    "id": 82934,
	                    "created_by": "614",
	                    "value": "pure_mind_2_galerii.jpg"
	                },
	                { "file": "https://saal.entu.ee/api2/file-355",
	                    "id": 82935,
	                    "created_by": "614",
	                    "value": "pure_mind_1_galerii.jpg"
	                },
	                { "file": "https://saal.entu.ee/api2/file-353",
	                    "id": 82933,
	                    "created_by": "614",
	                    "value": "pure_mind_esileht.jpg"
	                }
	            ]
	        }
	    ]
	}
